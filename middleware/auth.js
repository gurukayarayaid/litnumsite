function requireAuth(role) {
  return (req, res, next) => {
    if (!req.session.user) {
      return res.status(401).json({ error: 'Silakan login terlebih dahulu' });
    }
    if (role && req.session.user.role !== role) {
      return res.status(403).json({ error: 'Akses ditolak' });
    }
    next();
  };
}

module.exports = { requireAuth };
