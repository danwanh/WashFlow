import { Router } from 'express'
import * as controller from '../controllers/orders.js'
import * as workflow from '../controllers/workflow.js'
const router = Router()
router.post('/plan', controller.plan)
router.post('/', controller.create)
router.get('/', controller.list)
router.get('/:orderId', controller.get)
router.post('/:orderId/pickup-change', controller.pickupChange)
router.post('/:orderId/reschedule', controller.reschedule)
router.post('/:orderId/classification', controller.classification)
router.post('/:orderId/packing', workflow.packing)
router.post('/:orderId/notifications/draft', workflow.draft)
router.post('/:orderId/notifications', workflow.notify)
export default router
