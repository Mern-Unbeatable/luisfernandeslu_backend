import { Router } from 'express';

class UserRoutes {
  constructor() {
    this.router = Router();
    this.initRoutes();
  }

  initRoutes() {
    this.router.get('/', (req, res) => {
      res.status(200).json({ message: 'Users route' });
    });
  }

  getRoutes() {
    return this.router;
  }
}

export default new UserRoutes().getRoutes();
