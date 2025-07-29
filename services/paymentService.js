const { User } = require('@models');
const { NIGERIA_CREDIT_RATE, DEFAULT_CREDIT_RATE } = process.env;
class PaymentService {
  async getRate(userId, credit) {
    const user = await User.findById(userId).populate('currency');
    const userCurrency = user.currency;
    const userCurrencyCode = userCurrency.code;
    let convertedAmount;
    if (userCurrencyCode === 'NGN') {
      convertedAmount = credit * NIGERIA_CREDIT_RATE;
    } else {
      convertedAmount = credit * DEFAULT_CREDIT_RATE;
    }
    return {
      amount: convertedAmount,
      currency: userCurrency.symbol,
    };
  }
}

module.exports = PaymentService;
