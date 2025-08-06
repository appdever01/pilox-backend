const { User, Currency, Country, CreditHistory, Payment } = require('@models');
const bcrypt = require('bcryptjs');
const {
  getUserCreditBalance,
  response,
  generateCreditHistoryReference,
} = require('@helpers');
const dotenv = require('dotenv');
dotenv.config();

class UserController {
  async getUserCreditBalance(req, res) {
    const userId = req.user._id;
    const balance = await getUserCreditBalance(userId);
    return res.json({ balance });
  }

  async setUserWalletAddress(req, res) {
    const userId = req.user._id;
    const user = await User.findById(userId);
    if (!user) {
      return response(res, 200, 'error', 'User not found');
    }
    if (user.walletAddress) {
      return response(res, 200, 'error', 'Wallet address already set');
    }
    const { walletAddress } = req.body;
    if (!walletAddress) {
      return response(res, 200, 'error', 'Wallet address is required');
    }
    await User.findByIdAndUpdate(userId, { walletAddress });
    return response(res, 200, 'success', 'Wallet address set successfully');
  }

  async swapTokenForCredit(req, res) {
    try {
      const userId = req.user._id;
      console.log(userId);
      const user = await User.findById(userId).populate('currency');
      if (!user) {
        return response(res, 200, 'error', 'User not found');
      }
      if (!user.walletAddress) {
        return response(res, 200, 'error', 'Wallet address not set');
      }
      const { credits } = req.body;
      if (!credits) {
        return response(res, 200, 'error', 'Credit is required');
      }
      if (credits <= 0) {
        return response(res, 200, 'error', 'Credit must be greater than 0');
      }
      const axios = require('axios');
      const token = process.env.BLOCKCHAIN_SECRET_KEY;
      const api = process.env.BLOCKCHAIN_API_URL;
      const rate = process.env.PILOX_CREDIT_RATE || 200;

      const checkBalance = await axios.post(
        `${api}/balance/${user.walletAddress}`,
        {},
        {
          headers: {
            Authorization: `Bearer ${token}`,
          },
        }
      );

      if (checkBalance.data.status === true) {
        const balance = checkBalance.data.data.balance;
        const amount = credits * rate;
        if (balance < amount) {
          return response(res, 200, 'error', 'Insufficient $PILOX balance');
        }

        const deductToken = await axios.post(
          `${api}/deduct-token`,
          {
            userAddress: user.walletAddress,
            amount: amount,
          },
          {
            headers: {
              Authorization: `Bearer ${token}`,
            },
          }
        );

        if (deductToken.data.status === true) {
          const reference = await generateCreditHistoryReference();
          
          await Payment.create({
            user: user._id,
            reference,
            amount,
            description: `PILOX swap for ${credits} credits`,
            currency: user.currency._id, 
            method: 'PILOX',
            status: 'completed',
            credits
          });

          await User.findByIdAndUpdate(user._id, {
            $inc: { credits: credits },
          });

          const creditHistoryReference = await generateCreditHistoryReference();
          await CreditHistory.create({
            user: user._id,
            credits,
            reference: creditHistoryReference,
            type: 'credit',
            description: `PILOX swap for ${credits} credits`,
            status: 'completed',
            createdAt: new Date(),
          });

          return response(res, 200, 'success', 'Token swap completed successfully', {
            credits_added: credits
          });
        } else {
          return response(res, 200, 'error', 'Failed to deduct token');
        }
      } else {
        return response(res, 200, 'error', 'Failed to check balance');
      }
    } catch (error) {
      console.error('Token swap error:', error);
      return response(res, 500, 'error', 'An error occurred during token swap');
    }
  }

  async getUserDetails(req, res) {
    const userId = req.user._id;
    const user = await User.findById(userId)
      .populate('country')
      .populate('currency');
    const credits = await getUserCreditBalance(user._id);
    return response(res, 200, 'success', 'User details fetched successfully', {
      user: {
        id: user._id,
        name: user.name,
        email: user.email,
        credits: credits,
        status: user.status,
        isVerified: user.isVerified,
        referralCode: user.referralCode,
        walletAddress: user.walletAddress,
        country: {
          name: user.country.name,
          code: user.country.code,
        },
        currency: {
          name: user.currency.name,
          code: user.currency.code,
          symbol: user.currency.symbol,
          rate: user.currency.rate,
        },
      },
    });
  }

  async updateUserDetails(req, res) {
    const userId = req.user._id;
    const { name, currency } = req.body;
    if (!currency || !name) {
      return response(res, 200, 'error', 'Currency and name are required');
    }
    const currencyCode = currency.toUpperCase();
    const validCurrency = await Currency.findOne({ code: currencyCode });
    if (!validCurrency) {
      return response(res, 200, 'error', 'Invalid currency selected');
    }
    const countryCode = currencyCode === 'NGN' ? 'NG' : 'US';
    const country = await Country.findOne({ code: countryCode });
    if (!country) {
      return response(res, 200, 'error', 'Failed to find matching country');
    }
    await User.findByIdAndUpdate(userId, {
      name,
      currency: validCurrency._id,
      country: country._id,
    });
    return response(res, 200, 'success', 'User details updated successfully', {
      user: {
        name,
        currency: {
          name: validCurrency.name,
          code: validCurrency.code,
          symbol: validCurrency.symbol,
          rate: validCurrency.rate,
        },
      },
    });
  }

  async getUserCreditHistory(req, res) {
    const userId = req.user._id;
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const skip = (page - 1) * limit;
    const [history, total] = await Promise.all([
      CreditHistory.find({ user: userId })
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit),
      CreditHistory.countDocuments({ user: userId }),
    ]);
    const totalPages = Math.ceil(total / limit);
    return response(
      res,
      200,
      'success',
      'Credit history fetched successfully',
      {
        history,
        pagination: {
          total,
          page,
          totalPages,
          limit,
          hasNextPage: page < totalPages,
          hasPrevPage: page > 1,
        },
      }
    );
  }

  async updatePassword(req, res) {
    const userId = req.user._id;
    const { old_password, password, confirm_password } = req.body;
    if (password !== confirm_password) {
      return response(res, 200, 'error', 'Passwords do not match');
    }
    const user = await User.findById(userId);
    const isMatch = await bcrypt.compare(old_password, user.password);
    if (!isMatch) {
      return response(res, 200, 'error', 'Invalid old password');
    }
    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(password, salt);
    await User.findByIdAndUpdate(userId, { password: hashedPassword });
    return response(res, 200, 'success', 'Password updated successfully');
  }

  async getReferralDetails(req, res) {
    const userId = req.user._id;
    const referrals = await User.find({ referredBy: userId });
    const totalReferrals = referrals.length;
    const totalCredits = referrals.reduce(
      (acc, referral) => acc + referral.referralCredit,
      0
    );
    return response(
      res,
      200,
      'success',
      'Referral details fetched successfully',
      {
        total_referrals: totalReferrals,
        total_credits: totalCredits,
      }
    );
  }

  async getReferralHistory(req, res) {
    const userId = req.user._id;
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const skip = (page - 1) * limit;
    const [history, total] = await Promise.all([
      User.find({ referredBy: userId })
        .sort({ createdAt: -1 })
        .skip(skip)
        .select('createdAt name referralCredit')
        .limit(limit),
      User.countDocuments({ referredBy: userId }),
    ]);
    const totalPages = Math.ceil(total / limit);
    return response(
      res,
      200,
      'success',
      'Referral history fetched successfully',
      {
        history,
        pagination: {
          total,
          page,
          totalPages,
          limit,
          hasNextPage: page < totalPages,
          hasPrevPage: page > 1,
        },
      }
    );
  }
}

module.exports = UserController;
