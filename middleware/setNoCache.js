function setNoCache(req, res, next) {
    res.setHeader('Cache-Control', 'private, no-store, no-cache, must-revalidate, proxy-revalidate');
    res.setHeader('Expires', '-1');
    res.setHeader('Pragma', 'no-cache');
    next();
}
module.exports = setNoCache;