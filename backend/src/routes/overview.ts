import { Router } from 'express'
import * as controller from '../controllers/overview.js'

const router = Router()
router.get('/', controller.get)
export default router
