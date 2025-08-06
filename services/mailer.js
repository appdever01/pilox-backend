const axios = require('axios');

class MailService {
  constructor() {
    this.apiKey = process.env.ZEPTO_API_KEY;
    this.fromEmail = [
      'naheem@pilox.com.ng',
      'tesals@pilox.com.ng',
      'treasure@pilox.com.ng',
      'dipo@pilox.com.ng',
      'victor@pilox.com.ng',
    ][Math.floor(Math.random() * 4)];
    this.baseUrl = 'https://api.zeptomail.com/v1.1/email/template';
  }

  async sendMail(to, name) {
    try {
      const response = await axios({
        method: 'post',
        url: this.baseUrl,
        headers: {
          Accept: 'application/json',
          'Content-Type': 'application/json',
          Authorization: `${this.apiKey}`,
        },
        data: {
          mail_template_key: process.env.MAILER_KEY,
          from: {
            address: this.fromEmail,
            name: `${this.fromEmail.split('@')[0].charAt(0).toUpperCase() + this.fromEmail.split('@')[0].slice(1)} from pilox`,
          },
          to: [
            {
              email_address: {
                address: to,
                name: to.split('@')[0],
              },
            },
          ],
          merge_info: {
            firstname:
              name.split(' ')[0].charAt(0).toUpperCase() +
              name.split(' ')[0].slice(1),
            sender_name:
              this.fromEmail.split('@')[0].charAt(0).toUpperCase() +
              this.fromEmail.split('@')[0].slice(1),
          },
        },
      });
      return response.data;
    } catch (error) {
      console.error('Mail sending failed:', error);
      throw new Error('Failed to send email');
    }
  }

  async sendWelcomeEmail(userEmail, userName) {
    return this.sendMail(userEmail, userName);
  }

  async sendPasswordResetEmail(name, email, resetToken, device, location) {
    await axios.post(
      'https://api.zeptomail.com/v1.1/email/template',
      {
        mail_template_key:
          '2d6f.511e5dc87b01e74c.k1.7629a460-cca7-11ef-b8e2-525400ae9113.1943ece81a6',
        from: {
          address: 'noreply@pilox.com.ng',
          name: 'Forgot Password | pilox',
        },
        to: [{ email_address: { address: email, name: name } }],
        merge_info: {
          reset_password_link: `${process.env.FRONTEND_URL}/reset-password/${resetToken}`,
          device: device,
          location: location,
          time: new Date().toLocaleString(),
        },
      },
      {
        headers: {
          Accept: 'application/json',
          'Content-Type': 'application/json',
          Authorization: `${process.env.ZEPTO_API_KEY}`,
        },
      }
    );
  }

  async sendPasswordResetSuccessEmail(userEmail, userName) {
    const subject = 'Password Reset Success';
    const htmlContent = `Your password has been successfully reset.`;
    return this.sendMail(userEmail, userName, subject, htmlContent);
  }

  async sendPasswordResetFailedEmail(userEmail, userName) {
    const subject = 'Password Reset Failed';
    const htmlContent = `Your password reset request failed. Please try again.`;
    return this.sendMail(userEmail, userName, subject, htmlContent);
  }

  async sendPasswordResetExpiredEmail(userEmail, userName) {
    const subject = 'Password Reset Expired';
    const htmlContent = `Your password reset request has expired. Please request a new password reset.`;
    return this.sendMail(userEmail, userName, subject, htmlContent);
  }

  async sendNewsletterEmail(userEmail, subject, htmlContent) {
    return this.sendMail(userEmail, subject, htmlContent);
  }

  async sendWaitlistWelcomeEmail(userEmail, userName) {
    const subject = 'Welcome to our Waitlist!';
    const htmlContent =
      "Thank you for joining our waitlist. We'll notify you when you're granted access!";
    return this.sendMail(userEmail, userName, subject, htmlContent);
  }

  async sendWaitlistAccessGrantedEmail(userEmail, userName) {
    const subject = 'Access Granted!';
    const htmlContent =
      'Your wait is over! You now have full access to our platform.';
    return this.sendMail(userEmail, userName, subject, htmlContent);
  }

  async sendNewsletterWelcomeEmail(userEmail, userName) {
    return this.sendMail(userEmail, userName);
  }

  async sendVerificationEmail(token, email, name) {
    await axios.post(
      'https://api.zeptomail.com/v1.1/email/template',
      {
        mail_template_key:
          '2d6f.511e5dc87b01e74c.k1.91ef60b0-d114-11ef-a4d8-ba177e24b316.1945bd0723b',
        from: { address: 'noreply@pilox.com.ng', name: 'Verification | pilox' },
        to: [{ email_address: { address: email, name: name } }],
        merge_info: {
          verification_link: `${process.env.FRONTEND_URL}/verify-email/${token}`,
        },
      },
      {
        headers: {
          Accept: 'application/json',
          'Content-Type': 'application/json',
          Authorization: `${process.env.ZEPTO_API_KEY}`,
        },
      }
    );
  }

  async sendVideoGenerationEmail(userEmail, userName, downloadLink) {
    try {
      await axios.post(
        'https://api.zeptomail.com/v1.1/email/template',
        {
          mail_template_key:
            '2d6f.511e5dc87b01e74c.k1.d2bf4ea0-d2d3-11ef-a4d8-ba177e24b316.1946743908a',
          from: {
            address: 'noreply@pilox.com.ng',
            name: 'Video Generation | pilox',
          },
          to: [
            {
              email_address: {
                address: userEmail,
                name: userName,
              },
            },
          ],
          merge_info: {
            download_link: downloadLink,
          },
        },
        {
          headers: {
            Accept: 'application/json',
            'Content-Type': 'application/json',
            Authorization: `${process.env.ZEPTO_API_KEY}`,
          },
        }
      );

      return true;
    } catch (error) {
      console.error('Video generation email sending failed:', error);
      throw new Error('Failed to send video generation email');
    }
  }

  async sendVideoGenerationFailureEmail(userEmail, userName, retryLink) {
    try {
      await axios.post(
        'https://api.zeptomail.com/v1.1/email/template',
        {
          mail_template_key:
            '2d6f.511e5dc87b01e74c.k1.ce04a8c0-d2ff-11ef-a4d8-ba177e24b316.1946863cd4c',
          from: {
            address: 'noreply@pilox.com.ng',
            name: 'Video Generation Failed | pilox',
          },
          to: [
            {
              email_address: {
                address: userEmail,
                name: userName,
              },
            },
          ],
          merge_info: {
            retry_link: retryLink,
          },
        },
        {
          headers: {
            Accept: 'application/json',
            'Content-Type': 'application/json',
            Authorization: `${process.env.ZEPTO_API_KEY}`,
          },
        }
      );

      return true;
    } catch (error) {
      console.error('Video generation failure email sending failed:', error);
      throw new Error('Failed to send video generation failure email');
    }
  }
}

module.exports = new MailService();
