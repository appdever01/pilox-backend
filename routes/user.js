const express = require('express');
const router = express.Router();
const UserController = require('@controllers/UserController');
const userController = new UserController();
const { authMiddleware } = require('@middleware/auth');

router.use(authMiddleware);
router.get('/credit-balance', userController.getUserCreditBalance);
router.get('/details', userController.getUserDetails);
router.post('/update-details', userController.updateUserDetails);
router.post('/set-wallet-address', userController.setUserWalletAddress);
router.get('/credit-history', userController.getUserCreditHistory);
router.post('/update-password', userController.updatePassword);
router.get('/referral-details', userController.getReferralDetails);
router.get('/referral-history', userController.getReferralHistory);
module.exports = router;
