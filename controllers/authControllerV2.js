const Newsletter = require('../models/Newsletter');
const mailer = require('../services/mailer');
class V2AuthController {
  newsletterSubscribe = async (req, res) => {
    try {
      const { email } = req.body;
      console.log(email);
      // Check if email is already subscribed
      const existingSubscriber = await Newsletter.findOne({ email });
      if (existingSubscriber) {
        return res.status(400).json({
          status: 'error',
          message: 'Email is already subscribed to the newsletter',
        });
      }

      // Add email to newsletter subscription
      const subscriber = await Newsletter.create({
        email,
        subscribedAt: new Date(),
      });

      const name = email.split('@')[0];

      // Send confirmation email
      await mailer.sendNewsletterWelcomeEmail(email, name);

      res.status(201).json({
        status: 'success',
        message: 'Successfully subscribed to the newsletter',
        data: {
          email: subscriber.email,
        },
      });
    } catch (error) {
      console.error('Error subscribing to newsletter:', error);
      return res.status(500).json({
        status: 'error',
        message: 'Error subscribing to newsletter',
      });
    }
  };

  newsletterUnsubscribe = async (req, res) => {
    try {
      const { email } = req.body;

      await Newsletter.findOneAndDelete({ email });
      res.status(200).json({
        status: 'success',
        message: 'Successfully unsubscribed from newsletter',
      });
    } catch (error) {
      console.error('Error unsubscribing from newsletter', error);
      return res.status(500).json({
        status: 'error',
        message: 'Error unsubscribing from newsletter',
      });
    }
  };

  sendNewsLetter = async (req, res) => {
    try {
      const { subject, htmlContent } = req.body;
      const emails_to_send_to = await Newsletter.find({});
      for (const email of emails_to_send_to) {
        await mailer.sendNewsletterEmail({
          email: email.email,
          subject,
          htmlContent,
        });
      }
    } catch (error) {
      console.error('Error sending newsletter', error);
      return res.status(500).json({
        status: 'error',
        message: 'Error sending newsletter',
      });
    }
  };
}

module.exports = new V2AuthController();
