import { Router } from 'express'
import * as controller from '../controllers/machines.js'
const router = Router()
router.get('/', controller.list)
router.patch('/:machineId', controller.update)
export default router
