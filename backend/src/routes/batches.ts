import { Router } from 'express'
import { stage } from '../controllers/workflow.js'
const router = Router()
router.post('/:batchId/stages/:stageId/start', stage)
router.post('/:batchId/stages/:stageId/machine-finished', stage)
router.post('/:batchId/stages/:stageId/unload', stage)
export default router
