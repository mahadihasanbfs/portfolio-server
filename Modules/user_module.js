const bcrypt = require('bcrypt');
const Joi = require('joi');
const jwt = require('jsonwebtoken');
const { user_collection } = require('../Collection/all_collection');



const signInSchema = Joi.object({
    email: Joi.string().email().required(),
    password: Joi.string().min(6).required()
});

const sign_up = async (req, res, next) => {
    const { name, email, password, designation, image } = req.body;

    // Basic validation checks
    if (!name || !email || !password || !designation) {
        return res.status(400).send({
            success: false,
            message: 'Invalid input data. Required fields are missing.',
            request_time: new Date().getTime()
        });
    }

    // Validate email format
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
        return res.status(400).send({
            success: false,
            message: 'Invalid email format.',
            request_time: new Date().getTime()
        });
    }

    // Validate password length
    if (password.length < 6) {
        return res.status(400).send({
            success: false,
            message: 'Password should be at least 6 characters long.',
            request_time: new Date().getTime()
        });
    }

    try {
        // Check if the user already exists with the given email
        const existingUser = await user_collection.findOne({ email });
        if (existingUser) {
            return res.status(400).send({
                success: false,
                message: 'User with this email already exists.',
                request_time: new Date().getTime()
            });
        }

        // Hash the user's password
        const hashedPassword = await bcrypt.hash(password, 10);
        const user = {
            name,
            email,
            password: hashedPassword,
            designation,
            image,
            timestamp: new Date().getTime()
        };

        // Insert the new user into the database
        const result = await user_collection.insertOne(user);

        // Respond with success message and inserted user data
        res.send({
            success: true,
            message: 'User added successfully',
            data: result.ops, // Return inserted documents
            request_time: new Date().getTime()
        });
    } catch (error) {
        next(error); // Pass errors to the error handler middleware
    }
};

// Sign in function
const sign_in = async (req, res, next) => {
    const body = req.body;

    const { error } = signInSchema.validate(body);
    if (error) {
        return res.status(400).send({
            success: false,
            message: 'Invalid input data',
            details: error.details,
            request_time: new Date().getTime()
        });
    }

    try {
        const user = await user_collection.findOne({ email: body.email });
        if (!user) {
            return res.status(401).send({
                success: false,
                message: 'Invalid email or password',
                request_time: new Date().getTime()
            });
        }

        const isPasswordValid = await bcrypt.compare(body.password, user.password);
        if (!isPasswordValid) {
            return res.status(401).send({
                success: false,
                message: 'Invalid email or password',
                request_time: new Date().getTime()
            });
        }

        // express 30 days

        const token = jwt.sign({ userId: user._id, email: user.email }, 'your_jwt_secret_key', {
            expiresIn: '30d'
        });

        // Remove password field from the user object before sending it in the response
        const { password, ...userWithoutPassword } = user;

        res.cookie('authToken', token, {
            httpOnly: true, // Prevents client-side JavaScript from accessing the cookie
            secure: process.env.NODE_ENV === 'production', // Ensures the cookie is only sent over HTTPS in production
            maxAge: 3600000 // Cookie expiration time in milliseconds (1 hour)
        });

        res.send({
            success: true,
            message: 'User signed in successfully',
            token: token, // Include the token in the response body as well
            user: userWithoutPassword,
            request_time: new Date().getTime()
        });
    } catch (error) {
        next(error);
    }
};

module.exports = { sign_up, sign_in };
module.exports = { sign_up, sign_in };
