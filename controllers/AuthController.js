require('dotenv').config();
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { User, Country, CreditHistory, Newsletter } = require('@models');
const mailer = require('@services/mailer');
const {
  generateReferralCode,
  generateCreditHistoryReference,
  getSetting,
  response,
} = require('@helpers');
const referralCredit = parseInt(process.env.REFERRAL_CREDIT);
const crypto = require('crypto');

var admin = require('firebase-admin');
var serviceAccount = require('../serviceAccountKey.json');
if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount),
  });
}
const { getCountryFromIP } = require('@helpers');

class AuthController {
  async signup(req, res) {
    try {
      const { email, password, name, referral } = req.body;
      if (!email || !password || !name) {
        return response(res, 200, 'error', 'Invalid input parameters');
      }
      let user = await User.findOne({ email });
      if (user) {
        return response(res, 200, 'error', 'User already exists');
      }
      let referredBy = null;
      if (referral) {
        var referralC = referral.toUpperCase();
        referredBy = await User.findOne({ referralCode: referralC });
        if (!referredBy) {
          return response(res, 200, 'error', 'Invalid referral code');
        }
      }
      const userIP =
        req.headers['x-forwarded-for']?.split(',')[0]?.trim() ||
        req.headers['x-real-ip'] ||
        req.headers['x-client-ip'] ||
        req.headers['cf-connecting-ip'] ||
        req.headers['true-client-ip'] ||
        req.headers['x-cluster-client-ip'] ||
        req.socket.remoteAddress ||
        req.connection.remoteAddress ||
        '0.0.0.0';
      const userCountry = await getCountryFromIP(userIP);
      const country = await Country.findOne({ name: userCountry.name });
      let countryId, currencyId;
      if (country) {
        countryId = country._id;
        currencyId = country.currency;
      } else {
        const defaultCountry = await Country.findOne({ code: 'US' });
        if (!defaultCountry) {
          return response(
            res,
            500,
            'error',
            'Default country configuration missing'
          );
        }
        countryId = defaultCountry._id;
        currencyId = defaultCountry.currency;
      }
      const referralCode = await generateReferralCode();
      const salt = await bcrypt.genSalt(10);
      const hashedPassword = await bcrypt.hash(password, salt);
      const verificationToken = crypto.randomBytes(32).toString('hex');
      user = new User({
        email,
        password: hashedPassword,
        name,
        country: countryId,
        currency: currencyId,
        authMode: 'normal',
        referralCode: referralCode,
        referralCredit: referredBy ? referralCredit : 0,
        referredBy: referredBy?._id ?? null,
        verificationToken: verificationToken,
        verificationTokenExpires: new Date(Date.now() + 20 * 60 * 1000),
        status: 'inactive',
      });
      await user.save();
      user = await User.findById(user._id)
        .populate('country')
        .populate('currency');

      const token = jwt.sign({ userId: user._id }, process.env.JWT_SECRET, {
        expiresIn: '30d',
      });

      try {
        await mailer.sendVerificationEmail(
          user.verificationToken,
          user.email,
          user.name
        );
        user.lastSentVerificationEmail = new Date();
        await user.save();
        return response(res, 200, 'success', 'Sign up successful', {
          user: {
            id: user._id,
            name: user.name,
            email: user.email,
            status: user.status,
            isVerified: user.isVerified,
            token: token,
          },
        });
      } catch (emailError) {
        console.error('Failed to send verification email:', emailError);
        return response(res, 200, 'success', 'Sign up successful', {
          user: {
            id: user._id,
            name: user.name,
            email: user.email,
            status: user.status,
            isVerified: user.isVerified,
            token: token,
          },
        });
      }
      // res.json({
      //   status: 'success',
      //   message: 'Login successful',
      //   user: {
      //     id: user._id,
      //     name: user.name,
      //     status: user.status,
      //     verified: user.isVerified,
      //     email: user.email,
      //     credit: user.credits,
      //     referralCode: user.referralCode,
      //     isVerified: user.isVerified,
      //     country: {
      //       name: user.country.name,
      //       code: user.country.code,
      //     },
      //     currency: {
      //       name: user.currency.name,
      //       code: user.currency.code,
      //       symbol: user.currency.symbol,
      //       rate: user.currency.rate,
      //     },
      //     token,
      //   },
      // });
    } catch (error) {
      console.error('Signup error:', error);
      return response(res, 500, 'error', 'Server error');
    }
  }

  async login(req, res) {
    try {
      const { email, password } = req.body;
      if (!email || !password) {
        return response(res, 200, 'error', 'Email and password are required');
      }
      let user = await User.findOne({ email })
        .populate('country')
        .populate('currency');
      if (!user) {
        return response(res, 200, 'error', 'Invalid credentials');
      }
      if (!user.password) {
        return response(res, 200, 'error', 'Invalid credentials');
      }
      const isMatch = await bcrypt.compare(password, user.password);
      if (!isMatch) {
        return response(res, 200, 'error', 'Invalid credentials');
      }
      const token = jwt.sign({ userId: user._id }, process.env.JWT_SECRET, {
        expiresIn: '30d',
      });
      if (!user.isVerified) {
        return response(res, 200, 'success', 'Login successful', {
          user: {
            id: user._id,
            name: user.name,
            email: user.email,
            status: user.status,
            isVerified: user.isVerified,
            token: token,
          },
        });
      }

      return response(res, 200, 'success', 'Login successful', {
        user: {
          id: user._id,
          name: user.name,
          email: user.email,
          credit: user.credits,
          referralCode: user.referralCode,
          isVerified: user.isVerified,
          status: user.status,
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
          token,
        },
      });
    } catch (error) {
      console.error('Login error:', error);
      return response(res, 500, 'error', 'Server error');
    }
  }

  async resendVerificationEmail(req, res) {
    try {
      const user = req.user;
      if (!user) {
        return response(res, 200, 'error', 'User not found');
      }
      if (
        user.lastSentVerificationEmail &&
        new Date(user.lastSentVerificationEmail).getTime() + 2 * 60 * 1000 >
          Date.now()
      ) {
        const timeLeft =
          new Date(user.lastSentVerificationEmail).getTime() +
          2 * 60 * 1000 -
          Date.now();
        const minutes = Math.floor(timeLeft / 60000);
        const seconds = Math.floor((timeLeft % 60000) / 1000);
        return response(
          res,
          200,
          'error',
          `Please wait ${minutes} minute${minutes !== 1 ? 's' : ''}, ${seconds} second${seconds !== 1 ? 's' : ''} before requesting a new verification email`
        );
      }
      const token = crypto.randomBytes(32).toString('hex');
      user.verificationToken = token;
      user.verificationTokenExpires = new Date(Date.now() + 20 * 60 * 1000);
      await mailer.sendVerificationEmail(
        user.verificationToken,
        user.email,
        user.name
      );
      user.lastSentVerificationEmail = new Date();
      await user.save();
      return response(res, 200, 'success', 'Verification email sent');
    } catch (error) {
      console.error('Error sending verification email:', error);
      return response(res, 500, 'error', 'Error sending verification email');
    }
  }

  async verifyUser(req, res) {
    const { verify_token } = req.body;
    if (!verify_token) {
      return response(res, 200, 'error', 'Token is required');
    }
    let user = req.user;
    user = await User.findById(user._id)
      .populate('country')
      .populate('currency');
    if (!user) {
      return response(res, 200, 'error', 'User not found');
    }
    if (user.verificationToken !== verify_token) {
      const token = crypto.randomBytes(32).toString('hex');
      user.verificationToken = token;
      user.verificationTokenExpires = new Date(Date.now() + 20 * 60 * 1000);
      await mailer.sendVerificationEmail(
        user.verificationToken,
        user.email,
        user.name
      );
      user.lastSentVerificationEmail = new Date();
      await user.save();
      return response(
        res,
        200,
        'error',
        'Invalid token, another one has been resent to your email'
      );
    }
    if (user.verificationTokenExpires < Date.now()) {
      return response(res, 200, 'error', 'Token expired');
    }
    user.isVerified = true;
    user.status = 'active';
    user.verificationToken = null;
    user.verificationTokenExpires = null;
    await user.save();
    // try {
    //   await mailer.sendWelcomeEmail(user.email, user.name);
    // } catch (error) {
    //   console.error('Failed to send welcome email:', error);
    // }
    const token = jwt.sign({ userId: user._id }, process.env.JWT_SECRET, {
      expiresIn: '30d',
    });
    const creditHistoryReference = await generateCreditHistoryReference();
    await CreditHistory.create({
      user: user._id,
      credits: getSetting('welcomeCredit', 15),
      reference: creditHistoryReference,
      type: 'credit',
      description: `Welcome credit of ${getSetting('welcomeCredit', 15)} credits`,
      status: 'completed',
      createdAt: new Date(),
    });
    if (user.referredBy) {
      const referredBy = await User.findById(user.referredBy);
      if (referredBy) {
        const newReference = await generateCreditHistoryReference();
        await CreditHistory.create({
          user: referredBy._id,
          credits: referralCredit,
          reference: newReference,
          type: 'credit',
          description: `Referral credit of ${referralCredit} credits`,
          status: 'completed',
          createdAt: new Date(),
        });
      }
    }
    return response(res, 200, 'success', 'Verification successful', {
      user: {
        id: user._id,
        name: user.name,
        email: user.email,
        credit: user.credits,
        referralCode: user.referralCode,
        isVerified: user.isVerified,
        status: user.status,
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
        token,
      },
    });
  }

  async googleAuth(req, res) {
    try {
      const { token, referral } = req.body;
      if (!token) {
        return response(res, 200, 'error', 'Token is required');
      }
      const decodedToken = await admin.auth().verifyIdToken(token);
      const email = decodedToken.email;
      const name = decodedToken.name;
      let user;
      user = await User.findOne({ email });
      if (!user) {
        const referralCode = await generateReferralCode();
        let referredBy = null;
        if (referral) {
          var referralC = referral.toUpperCase();
          referredBy = await User.findOne({ referralCode: referralC });
        }
        const userIP =
          req.headers['x-forwarded-for']?.split(',')[0]?.trim() ||
          req.headers['x-real-ip'] ||
          req.headers['x-client-ip'] ||
          req.headers['cf-connecting-ip'] ||
          req.headers['true-client-ip'] ||
          req.headers['x-cluster-client-ip'] ||
          req.socket.remoteAddress ||
          req.connection.remoteAddress ||
          '0.0.0.0';
        const userCountry = await getCountryFromIP(userIP);
        const country = await Country.findOne({ name: userCountry.name });
        let countryId, currencyId;
        if (country) {
          countryId = country._id;
          currencyId = country.currency;
        } else {
          const defaultCountry = await Country.findOne({ code: 'US' });
          if (!defaultCountry) {
            return response(
              res,
              500,
              'error',
              'Default country configuration missing'
            );
          }
          countryId = defaultCountry._id;
          currencyId = defaultCountry.currency;
        }
        user = new User({
          email,
          name,
          country: countryId,
          currency: currencyId,
          authMode: 'google',
          referralCredit: referredBy ? referralCredit : 0,
          referralCode: referralCode,
          referredBy: referredBy != null ? referredBy._id : null,
          isVerified: true,
          status: 'active',
        });
        await user.save();
        if (referredBy !== null) {
          const newReference = await generateCreditHistoryReference();
          await CreditHistory.create({
            user: referredBy._id,
            credits: referralCredit,
            reference: newReference,
            type: 'credit',
            description: `Referral credit of ${referralCredit} credits`,
            status: 'completed',
            createdAt: new Date(),
          });
        }
        const creditHistoryReference = await generateCreditHistoryReference();
        await CreditHistory.create({
          user: user._id,
          credits: getSetting('welcomeCredit', 15),
          reference: creditHistoryReference,
          type: 'credit',
          description: `Welcome credit of ${getSetting('welcomeCredit', 15)} credits`,
          status: 'completed',
          createdAt: new Date(),
        });
        if (referredBy !== null) {
          const referredByUser = await User.findById(referredBy._id);
          if (referredByUser) {
            const newReference = await generateCreditHistoryReference();
            await CreditHistory.create({
              user: referredByUser._id,
              credits: referralCredit,
              reference: newReference,
              type: 'credit',
              description: `Referral credit of ${referralCredit} credits`,
              status: 'completed',
              createdAt: new Date(),
            });
          }
        }
        // try {
        //   await mailer.sendWelcomeEmail(user.email, user.name);
        // } catch (emailError) {
        //   console.error('Failed to send welcome email:', emailError);
        // }
      }
      user = await User.findById(user._id)
        .populate('country')
        .populate('currency');
      if (!user.isVerified) {
        user.status = 'active';
        user.isVerified = true;
        await user.save();
        const creditHistoryReference = await generateCreditHistoryReference();
        await CreditHistory.create({
          user: user._id,
          credits: getSetting('welcomeCredit', 15),
          reference: creditHistoryReference,
          type: 'credit',
          description: `Welcome credit of ${getSetting('welcomeCredit', 15)} credits`,
          status: 'completed',
          createdAt: new Date(),
        });
      }
      const jwtToken = jwt.sign({ userId: user._id }, process.env.JWT_SECRET, {
        expiresIn: '30d',
      });
      return response(res, 200, 'success', 'Login successful', {
        user: {
          id: user._id,
          name: user.name,
          email: user.email,
          credit: user.credits,
          referralCode: user.referralCode,
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
          token: jwtToken,
        },
      });
    } catch (error) {
      console.error('Login error:', error);
      return response(res, 500, 'error', 'Server error');
    }
  }

  async forgotPassword(req, res) {
    try {
      const { email } = req.body;
      const user = await User.findOne({ email });
      if (!user) {
        return response(
          res,
          200,
          'error',
          'No user found with that email address'
        );
      }
      if (user.lastSentPasswordResetEmail) {
        const timeDiff = Date.now() - user.lastSentPasswordResetEmail.getTime();
        const minutesPassed = Math.floor(timeDiff / 60000);
        const secondsPassed = Math.floor((timeDiff % 60000) / 1000);

        if (timeDiff < 5 * 60 * 1000) {
          return response(
            res,
            200,
            'error',
            `A password reset email was sent ${minutesPassed} minutes ${secondsPassed} seconds ago. Please wait and try again later.`
          );
        }
      }
      const resetToken = crypto.randomBytes(32).toString('hex');
      const passwordResetToken = crypto
        .createHash('sha256')
        .update(resetToken)
        .digest('hex');
      const passwordResetExpires = new Date(Date.now() + 20 * 60 * 1000);
      user.passwordResetToken = passwordResetToken;
      user.passwordResetExpires = passwordResetExpires;
      await user.save();
      const userIP =
        req.headers['x-forwarded-for']?.split(',')[0]?.trim() ||
        req.headers['x-real-ip'] ||
        req.headers['x-client-ip'] ||
        req.headers['cf-connecting-ip'] ||
        req.headers['true-client-ip'] ||
        req.headers['x-cluster-client-ip'] ||
        req.socket.remoteAddress ||
        req.connection.remoteAddress ||
        '0.0.0.0';
      const userCountry = await getCountryFromIP(userIP);
      await mailer.sendPasswordResetEmail(
        user.name,
        user.email,
        resetToken,
        userIP,
        userCountry.name
      );
      user.lastSentPasswordResetEmail = new Date();
      await user.save();
      return response(res, 200, 'success', 'Password reset email sent');
    } catch (error) {
      console.error('Error sending password reset email:', error);
      return response(
        res,
        500,
        'error',
        'Error sending email. Please try again later.'
      );
    }
  }
  async resetPassword(req, res) {
    try {
      const { reset_token } = req.body;
      const { password, confirm_password } = req.body;
      if (!password || !confirm_password) {
        return response(
          res,
          200,
          'error',
          'Password and confirm password are required'
        );
      }
      if (password !== confirm_password) {
        return response(res, 200, 'error', 'Passwords do not match');
      }
      if (password.length < 8) {
        return response(
          res,
          200,
          'error',
          'Password must be at least 8 characters long'
        );
      }
      if (!reset_token) {
        return response(res, 200, 'error', 'Reset token is required');
      }
      const hashedToken = crypto
        .createHash('sha256')
        .update(reset_token)
        .digest('hex');
      const user = await User.findOne({
        passwordResetToken: hashedToken,
        passwordResetExpires: { $gt: Date.now() },
      });
      if (!user) {
        return response(res, 200, 'error', 'Token is invalid or has expired');
      }
      const salt = await bcrypt.genSalt(10);
      const hashedPassword = await bcrypt.hash(password, salt);
      user.password = hashedPassword;
      user.passwordResetToken = null;
      user.passwordResetExpires = null;
      user.lastSentPasswordResetEmail = null;
      await user.save();
      return response(
        res,
        200,
        'success',
        'Password has been reset successfully, please login again'
      );
    } catch (error) {
      console.log(error);
      return response(res, 500, 'error', 'Error resetting password');
    }
  }

  async newsletterSubscribe(req, res) {
    try {
      const { email } = req.body;
      if (!email) {
        return response(res, 200, 'error', 'Email is required');
      }
      const existingSubscriber = await Newsletter.findOne({ email });
      if (existingSubscriber) {
        return response(
          res,
          200,
          'error',
          'Email is already subscribed to the newsletter'
        );
      }
      const subscriber = await Newsletter.create({
        email,
        subscribedAt: new Date(),
      });
      return response(
        res,
        200,
        'success',
        'Successfully subscribed to the newsletter',
        {
          data: {
            email: subscriber.email,
          },
        }
      );
    } catch (error) {
      console.error('Error subscribing to newsletter:', error);
      return response(res, 500, 'error', 'Error subscribing to newsletter');
    }
  }
}

module.exports = new AuthController();
