const { User, Currency, Country, CreditHistory } = require('@models');
const bcrypt = require('bcryptjs');
const { getUserCreditBalance, response } = require('@helpers');

class UserController {
  async getUserCreditBalance(req, res) {
    const userId = req.user._id;
    const balance = await getUserCreditBalance(userId);
    return res.json({ balance });
  }

  async isValidEthereumAddress(address) {
    return address.startsWith('0x') && address.length === 42;
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
