import { RequestHandler, Router } from 'express';
import { requireRoles } from '@banksphere/common';
import { AccountController } from '../controllers/account.controller';

export function createAccountRouter(controller: AccountController, authenticate: RequestHandler): Router {
  const router = Router();

  router.use(authenticate);

  router.post('/', controller.create);
  router.get('/', controller.list);
  // Before '/:accountId', which would otherwise capture it
  router.get('/lookup', requireRoles('TELLER', 'SUPPORT', 'BANK_ADMIN', 'KYC_OFFICER', 'FRAUD_ANALYST'), controller.lookup);
  router.get('/:accountId', controller.getById);
  router.patch('/:accountId/status', controller.updateStatus);
  router.patch('/:accountId/daily-limit', controller.updateDailyLimit);

  return router;
}
