const check_user = (req, res, next) => {
    // if heder_have_userid = mohotasim_hadi_rafi than next 
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