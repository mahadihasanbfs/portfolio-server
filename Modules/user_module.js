const bcrypt = require('bcrypt');
const Joi = require('joi');
const jwt = require('jsonwebtoken');
const nodemailer = require('nodemailer');
const { user_collection } = require('../Collection/all_collection');
const { ObjectId } = require('mongodb');



const signInSchema = Joi.object({
      email: Joi.string().email().required(),
      password: Joi.string().min(6).required()
});

const sign_up = async (req, res, next) => {
      const { name, email, password, designation, image } = req.body;

      if (!name || !email || !password || !designation) {
            return res.status(400).send({
                  success: false,
                  message: 'Invalid input data. Required fields are missing.',
                  request_time: new Date().getTime()
            });
      }

      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (!emailRegex.test(email)) {
            return res.status(400).send({
                  success: false,
                  message: 'Invalid email format.',
                  request_time: new Date().getTime()
            });
      }

      if (password.length < 6) {
            return res.status(400).send({
                  success: false,
                  message: 'Password should be at least 6 characters long.',
                  request_time: new Date().getTime()
            });
      }

      try {
            const existingUser = await user_collection.findOne({ email });
            if (existingUser) {
                  return res.status(400).send({
                        success: false,
                        message: 'User with this email already exists.',
                        request_time: new Date().getTime()
                  });
            }

            const hashedPassword = await bcrypt.hash(password, 10);
            const user = {
                  ...req.body, 
                  name,
                  email,
                  password: hashedPassword,
                  designation,
                  image,
                  timestamp: new Date().getTime(),
            };

            const result = await user_collection.insertOne(user);

            res.send({
                  success: true,
                  message: 'User added successfully',
                  data: result.ops,
                  request_time: new Date().getTime()
            });
      } catch (error) {
            next(error);
      }
};


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
let transporter = nodemailer.createTransport({
      service: 'gmail',
      auth: {
            user: 'brightfuturesoft@gmail.com',
            pass: 'bwtsggbfpdguuhjk' // or 'your-app-password'
      }
});


const email_template = (resetLink, user) => {
      return `
        <!DOCTYPE html>
        <html lang="en">
        <head>
            <meta charset="UTF-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <title>Reset Your Password</title>
            <style>
                @import url('https://cdn.jsdelivr.net/npm/tailwindcss@2.2.19/dist/tailwind.min.css');
                body {
                    background-color: #1e3a8a; /* Tailwind's blue-900 */
                    color: #ffffff; /* Tailwind's white */
                    font-family: Arial, sans-serif;
                }
                .container {
                    max-width: 600px;
                    margin: 50px auto;
                    color: #1e3a8a; /* Tailwind's blue-900 */
                    padding: 20px;
                    border-radius: 8px;
                    box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);
                }
                .btn {
                    display: inline-block;
                    background-color: #1e3a8a; /* Tailwind's blue-900 */
                    color: #ffffff; /* Tailwind's white */
                    padding: 10px 20px;
                    margin-top: 20px;
                    border-radius: 4px;
                    text-decoration: none;
                    font-weight: bold;
                }
                .btn:hover {
                    background-color: #3b82f6; /* Tailwind's blue-500 */
                }
            </style>
        </head>
        <body>
            <div class="container bg-white ">
                <h1 class="text-2xl font-bold mb-4">Reset Your Password</h1>
                <p class="mb-4">Hello ${user.name},</p>
                <p class="mb-4">We received a request to reset your password. Click the button below to reset it:</p>
                <a href="${resetLink}" class="btn">Reset Password</a>
                <p class="mt-4">If you didn't request a password reset, please ignore this email.</p>
                <p class="mt-4">
                Thank you,
                <br>
                Bright Future Soft
                 <br>
                 <a href="https://brightfuturesoft.com">https://brightfuturesoft.com</a>
                 </p>
            </div>
        </body>
        </html>
    `;
}


const forget_password = async (req, res, next) => {
      const { email } = req.body;

      try {
            const user = await user_collection.findOne({ email });


            if (!user) {
                  return res.status(404).send({
                        success: false,
                        message: "Sorry, we can't find this user.",
                        request_time: new Date().getTime()
                  });
            }

            const resetToken = jwt.sign({ email: user.email }, 'your_jwt_secret_key', { expiresIn: '1h' });
            const resetLink = `https://www.brightfuturesoft.com/reset-password?token=${resetToken}`;

            const mailOptions = {
                  from: 'noreply@brightfuturesoft.com',
                  to: user.email,
                  subject: `Password Reset Request For ${user.name}`,
                  html: email_template(resetLink, user)
            };

            await transporter.sendMail(mailOptions);

            res.send({
                  success: true,
                  message: 'Password reset email sent successfully.',
                  request_time: new Date().getTime()
            });
      } catch (error) {
            next(error);
      }
};


const reset_password = async (req, res, next) => {
      const { token } = req.query;
      const { password } = req.body;

      if (!token) {
            return res.status(400).send({
                  success: false,
                  message: 'Invalid or missing token.',
                  request_time: new Date().getTime()
            });
      }

      try {
            const decoded = jwt.verify(token, 'your_jwt_secret_key');
            const { email } = decoded;

            const user = await user_collection.findOne({ email });
            if (!user) {
                  return res.status(404).send({
                        success: false,
                        message: "Sorry, we can't find this user.",
                        request_time: new Date().getTime()
                  });
            }

            const hashedPassword = await bcrypt.hash(password, 10);
            await user_collection.updateOne({ email }, { $set: { password: hashedPassword } });

            res.send({
                  success: true,
                  message: 'Password reset successfully.',
                  request_time: new Date().getTime()
            });
      } catch (error) {
            if (error.name === 'TokenExpiredError') {
                  return res.status(400).send({
                        success: false,
                        message: 'Reset token has expired.',
                        request_time: new Date().getTime()
                  });
            }
            next(error);
      }
};

const get_all_users = async (req, res, next) => {
      const { email } = req.query;

      try {
            const users = await user_collection.find(
                  { email: { $ne: email } },
                  { projection: { password: 0 } }
            ).toArray();
            res.send({
                  success: true,
                  message: 'All users found successfully',
                  request_time: new Date().getTime(),
                  data: users
            });
      } catch (error) {
            next(error);
      }
};

const update_user_data = async (req, res, next) => {
      const { user_id } = req.query;
      const { name, designation, image } = req.body;
     

      try {
            const user = await user_collection.findOne({ _id: new ObjectId(user_id) });
            if (!user) {
                  return res.status(404).send({
                        success: false,
                        message: "Sorry, we can't find this user.",
                        request_time: new Date().getTime()
                  });
            }

            await user_collection.updateOne({ _id: new ObjectId(user_id) }, { $set: { name, designation, image } });
            let get_user = await user_collection.findOne({ _id: new ObjectId(user_id) });
            delete get_user.password



            res.send({
                  success: true,
                  message: 'User data updated successfully.',
                  request_time: new Date().getTime(),
                  user: get_user
            });
      } catch (error) {
            next(error);
      }
};

const update_user_password = async (req, res, next) => {
      const { user_id } = req.query;
      const { old_password, new_password } = req.body

      try {
            const user = await user_collection.findOne({ _id: new ObjectId(user_id) });
            if (!user) {
                  return res.status(404).send({
                        success: false,
                        message: "Sorry, we can't find this user.",
                        request_time: new Date().getTime()
                  });
            }

            const isPasswordValid = await bcrypt.compare(old_password, user.password);
            if (!isPasswordValid) {
                  return res.status(400).send({
                        success: false,
                        message: 'Invalid old password.',
                        request_time: new Date().getTime()
                  });
            }

            const hashedPassword = await bcrypt.hash(new_password, 10);
            await user_collection.updateOne({ _id: new ObjectId(user_id) }, { $set: { password: hashedPassword } });


            res.send({
                  success: true,
                  message: 'User password updated successfully.',
                  request_time: new Date().getTime()
            });
      } catch (error) {
            next(error);
      }
};

module.exports = { sign_up, sign_in, forget_password, reset_password, get_all_users, update_user_data, update_user_password };
