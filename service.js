const axios = require('axios');
const nodemailer = require('nodemailer');
const FormData = require('form-data');
const fs = require('fs');
const CryptoJS = require('crypto-js');
const createCsvWriter = require('csv-writer').createObjectCsvWriter;
const csv = require('csv-parser');
require('dotenv').config();

const readJSONFile = async (filePath) => {
  try {
    const data = await fs.promises.readFile(filePath, 'utf8');
    return JSON.parse(data);
  } catch (error) {
    throw new Error(`Failed to read JSON file: ${error.message}`);
  }
};

const getManagementToken = async () => {
  const url = process.env.AUTH0_MANAGEMENT_API_URL;
  const body = {
    client_id: process.env.AUTH0_CLIENT_ID,
    client_secret: process.env.AUTH0_CLIENT_SECRET,
    audience: process.env.AUTH0_AUDIENCE,
    grant_type: 'client_credentials',
  };

  try {
    const response = await axios.post(url, body, {
      headers: { 'Content-Type': 'application/json' },
    });

   // console.log('Access Token:', response.data.access_token);
    return response.data.access_token;
  } catch (error) {
    console.error('Error obtaining Auth0 management token:', error.response ? error.response.data : error.message);
    throw error;
  }
};

const getMoodleToken = async () => {
  const url = process.env.MOODLE_TOKEN_URL;

  const params = {
    username: process.env.MOODLE_USER_NAME,
    password: process.env.MOODLE_USER_PASSWORD,
    service: process.env.MOODLE_SERVICE,
  };

  try {
    const response = await axios.post(url, null, { params });

    if (response.data.token) {
    //  console.log('Token:', response.data.token);
      return response.data.token;
    } else {
      console.error('Error fetching token:', response.data);
      return null;
    }
  } catch (error) {
    console.error('Error during token request:', error.message);
    return null;
  }
};

const createMoodleUsers = async (moodleToken, userData) => {
  const params = {
    wstoken: moodleToken,
    wsfunction: 'local_wssassoon_create_enrol_users',
    users: userData.map((user) => ({
      username: user.email,
      firstname: user.given_name,
      lastname: user.family_name,
      email: user.email,
      auth: 'mo_saml',
    })),
  };

  const apiUrl = `${process.env.MOODLE_URL}/webservice/rest/server.php?moodlewsrestformat=json`;

  const response = await axios.post(apiUrl, null, { params });
  return response.data;
};

const generatePassword = () => {
  const randomString = CryptoJS.lib.WordArray.random(8).toString(CryptoJS.enc.Hex);
  return randomString;
};

// const importUsersToAuth0 = async (token, filePath) => {
//   const usersData = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
//   const usersWithPasswords = usersData.map((user) => {
//     const password = generatePassword();
//     return { ...user, password };
//   });

//   const csvWriter = createCsvWriter({
//     path: 'users_with_passwords.csv',
//     header: [
//       { id: 'username', title: 'Username' },
//       { id: 'firstname', title: 'First Name' },
//       { id: 'lastname', title: 'Last Name' },
//       { id: 'email', title: 'Email' },
//       { id: 'password', title: 'Password' },
//     ],
//   });

//   await csvWriter.writeRecords(usersWithPasswords);
//   console.log('Generated passwords saved to users_with_passwords.csv');

//   const form = new FormData();
//   form.append('users', fs.createReadStream('users_with_passwords.csv'));
//   form.append('connection_id', process.env.AUTH0_CONNECTION_ID);

//   try {
//     const response = await axios.post(
//       `https://${process.env.AUTH0_DOMAIN}/api/v2/jobs/users-imports`,
//       form,
//       { headers: { ...form.getHeaders(), Authorization: `Bearer ${token}` } }
//     );

//     console.log('Auth0 User Import Response:', response.data);
//     return response.data;
//   } catch (error) {
//     console.error('Error importing users to Auth0:', error.message);
//     throw error;
//   }
// };

const importUsersToAuth0 = async (token, filePath) => {
  try {
    // Read the existing user.json file
    const usersData = JSON.parse(fs.readFileSync(filePath, 'utf-8'));

    // Update each user with a generated password
    const updatedUsers = usersData.map((user) => {
      if (!user.password || user.password === '') {
        const password = generatePassword();
        return { ...user, password }; // Append the password
      }
      return user; // Keep existing password if already present
    });

    // Write the updated data back to the user.json file
    fs.writeFileSync(filePath, JSON.stringify(updatedUsers, null, 2), 'utf-8');
    // console.log('Passwords updated successfully in user.json');

    // Create form data for Auth0 import
    const form = new FormData();
    form.append('users', JSON.stringify(updatedUsers), {
      contentType: 'application/json',
      filename: 'users.json',
    });
    form.append('connection_id', process.env.AUTH0_CONNECTION_ID);

    // Send the data to Auth0 API
    const response = await axios.post(
      `https://${process.env.AUTH0_DOMAIN}/api/v2/jobs/users-imports`,
      form,
      { headers: { ...form.getHeaders(), Authorization: `Bearer ${token}` } }
    );

   // console.log('Auth0 User Import Response:', response.data);
    return response.data;
  } catch (error) {
    console.error('Error importing users to Auth0:', error.message);
    throw error;
  }
};

const oauthUserLoginTokenApi = async () => {
  const url = process.env.AUTH_TOKEN;
  const users = [];

  return new Promise((resolve, reject) => {
    fs.createReadStream('users_with_passwords.csv')
      .pipe(csv())
      .on('data', (row) => {
        users.push({
          username: row.Email,
          password: row.password,
        });
      })
      .on('end', async () => {
        const tokens = [];
        for (const user of users) {
          const body = {
            client_id: process.env.AUTH0_CLIENT_ID,
            client_secret: process.env.AUTH0_CLIENT_SECRET,
            grant_type: process.env.AUTH0_GRANT_TYPE,
            username: user.username,
            password: user.password,
          };

          try {
            const response = await axios.post(url, new URLSearchParams(body), {
              headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            });

            tokens.push({ username: user.username, access_token: response.data.access_token });
          } catch (error) {
            console.error('Error for user', user.username, ':', error.message);
          }
        }
        resolve(tokens);
      })
      .on('error', (err) => reject(err));
  });
};

const sendDataToBoundlessAPI = async (token, matchedUsers, userData) => {
  for (const user of userData) {
    const matchedUser = matchedUsers.find((u) => u.email === user.email);

    if (matchedUser) {
      const headers = {
        piid: matchedUser.user_id,
        piSessionToken: token,
        apc: 'BDM',
        systemUrl: process.env.SALESFORCE_SYSTEM_URL,
        sourceSystem: 'Vanderbilt',
      };

      const body = {
        emailid: user.email,
        familyName: user.family_name,
        givenName: user.given_name,
        phoneNumber: user.phoneNumber || '',
        piid: matchedUser.user_id,
        preferredContactMethod: ['SMS', 'Phone', 'Email'],
        utmValue: 'utm_visited=SSO',
      };

      const response = await axios.post(process.env.BOUNDLESS_API, body, { headers });
      console.log(`Boundless API response for ${user.email}:`, response.data);
    } else {
      console.log(`No matching user found for email: ${user.email}`);
    }
  }
};

const sendVerificationEmails = async (matchedUsers) => {
  const transporter = nodemailer.createTransport({
    service: 'gmail',
    auth: {
      user: process.env.MAIL_USER,
      pass: process.env.MAIL_PASSWORD,
    },
  });

  for (const user of matchedUsers) {
    const mailOptions = {
      from: process.env.MAIL_USER,
      to: user.email,
      subject: 'Verification Email',
      html: `
        <p>Please verify your email by clicking the link below:</p>
        <a href="http://localhost:3000/verified-users/${user.user_id}">Verify your account</a>
      `,
    };

    await transporter.sendMail(mailOptions);
    console.log(`Verification email sent to: ${user.email}`);
  }
};

module.exports = {
  readJSONFile,
  getManagementToken,
  getMoodleToken,
  createMoodleUsers,
  generatePassword,
  importUsersToAuth0,
  oauthUserLoginTokenApi,
  sendDataToBoundlessAPI,
  sendVerificationEmails,
};
