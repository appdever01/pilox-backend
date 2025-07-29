const { User, Currency, Payment, CreditHistory } = require('@models');
const PaymentService = require('@services/paymentService');
const {
  getCreditRate,
  generateCreditHistoryReference,
} = require('@utils/helper');

const paymentService = new PaymentService();

class PaymentController {
  async getRate(req, res) {
    // const user = req.user;
    // try {
    //   await User.findByIdAndUpdate(user._id, {
    //     currency: '678177c6068dad45f07f0b31',
    //     country: await Country.findOne({ code: 'NG' })
    //   });
    // } catch (err) {
    //   console.error('Error updating user currency:', err);
    //   return res.status(500).json({
    //     status: 'error',
    //     message: 'Failed to update user currency'
    //   });
    // }
    try {
      const { credit } = req.body;
      if (!credit) {
        return res
          .status(400)
          .json({ status: 'error', message: 'credit is required' });
      }
      const parsedCredit = parseInt(credit);
      if (isNaN(parsedCredit)) {
        return res
          .status(400)
          .json({ status: 'error', message: 'credit must be a number' });
      }
      const userId = req.user._id;
      const amount = await paymentService.getRate(userId, parsedCredit);
      return res.json({
        status: 'success',
        message: 'Credit fetched successfully',
        amount,
      });
    } catch (error) {
      console.error('Error getting rate:', error);
      return res
        .status(500)
        .json({ status: 'error', message: 'Failed to get rate' });
    }
  }

  async paystackWebhook(req, res) {
    const { secret } = req.params;
    if (secret !== process.env.WEBHOOK_SECRET) {
      return res.status(401).json({ status: 'error', message: 'Unauthorized' });
    }
    const clientIp = req.ip;
    const isInRange = (ip, range) => {
      const [rangeIp, cidr] = range.split('/');
      if (!cidr) {
        return ip === rangeIp;
      }
      const ipLong =
        ip
          .split('.')
          .reduce((acc, octet) => (acc << 8) + parseInt(octet), 0) >>> 0;
      const rangeLong =
        rangeIp
          .split('.')
          .reduce((acc, octet) => (acc << 8) + parseInt(octet), 0) >>> 0;
      const mask = -1 << (32 - parseInt(cidr));
      return (ipLong & mask) === (rangeLong & mask);
    };
    const paystackIps = (ip) => {
      const allowedRanges = ['52.31.139.75', '52.49.173.169', '52.214.14.220'];
      return allowedRanges.some((range) => isInRange(ip, range));
    };
    const cloudflareIps = (ip) => {
      const allowedRanges = [
        '173.245.48.0/20',
        '103.21.244.0/22',
        '103.22.200.0/22',
      ];
      return allowedRanges.some((range) => isInRange(ip, range));
    };
    const ipAllowed = paystackIps(clientIp) || cloudflareIps(clientIp);
    if (!ipAllowed) {
      return res.status(401).json({ error: 'Unauthorized' });
    }
    const paystackSignature = req.headers['x-paystack-signature'];
    if (!paystackSignature) {
      return res.status(401).json({ error: 'Unauthorized' });
    }
    const input = req.body;
    const secretKey = process.env.PAYSTACK_SECRET_KEY;
    const computedSignature = require('crypto')
      .createHmac('sha512', secretKey)
      .update(JSON.stringify(req.body))
      .digest('hex');
    if (computedSignature !== paystackSignature) {
      console.log('Unauthorized signature');
      return res.status(200).json({ error: 'Unauthorized' });
    }
    const event = input;
    const user = await User.findOne({ email: event.data.customer.email });
    if (!user) {
      return res
        .status(404)
        .json({ status: 'error', message: 'User not found' });
    }
    if (event.event === 'charge.success') {
      if (event.data) {
        const reference = event.data.reference;
        try {
          const response = await fetch(
            `https://api.paystack.co/transaction/verify/${reference}`,
            {
              headers: {
                Authorization: `Bearer ${secretKey}`,
              },
            }
          );
          const check = await response.json();
          if (check.status === true) {
            const data = check.data;
            if (data.status === 'success') {
              const existingPayment = await Payment.findOne({ reference });
              if (existingPayment) {
                // await Payment.findOneAndDelete({ reference });
                return res.status(200).json({
                  status: 'success',
                  message: 'Payment already processed',
                });
              }
              const amount = data.amount / 100;
              const checkCurrency = data.currency == 'NGN' ? 'NGN' : 'USD';
              const currency = await Currency.findOne({ code: checkCurrency });
              const credits = await getCreditRate(
                user._id,
                amount,
                checkCurrency
              );
              await Payment.create({
                user: user._id,
                reference,
                amount,
                description: `Payment for ${credits} credits`,
                currency: currency._id,
                method: 'PAYSTACK',
                status: 'completed',
                credits,
                verificationResponse: check,
              });
              await User.findByIdAndUpdate(user._id, {
                $inc: { credits: credits },
              });
              const creditHistoryReference =
                await generateCreditHistoryReference();
              await CreditHistory.create({
                user: user._id,
                credits,
                reference: creditHistoryReference,
                type: 'credit',
                description: `Credit topup of ${credits} credits`,
                status: 'completed',
                createdAt: new Date(),
              });
              return res.status(200).json({
                status: 'success',
                message: 'Payment processed successfully',
              });
            }
          }
        } catch (error) {
          console.error('Failed to verify transaction:', error);
          return res
            .status(500)
            .json({ status: 'error', message: 'Failed to verify transaction' });
        }
      }
    }
  }
}

module.exports = PaymentController;
