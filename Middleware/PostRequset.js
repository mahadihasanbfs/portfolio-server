const check_user = (req, res, next) => {
    if (req.header('author') == 'bright_future_soft') {
        next()
    } else {
        res.send({
            success: false,
            message: 'Unauthorized',
            request_time: new Date().getTime()
        })
    }
}
module.exports = check_user


