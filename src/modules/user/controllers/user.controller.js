export class UserController {
  async getUsers(req, res) {
    res.status(200).json({ message: 'Users fetched' });
  }
}
