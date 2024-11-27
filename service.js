const axios = require('axios');
const nodemailer = require('nodemailer');
const FormData = require('form-data');
const fs = require('fs');
const CryptoJS = require('crypto-js');
require('dotenv').config();

const filterUsersByEmails = async (allUsers, filePath) => {
  const emailsFromJson = await getEmailsFromJson(filePath);
  return allUsers.filter(user => emailsFromJson.includes(user.email));
}

const getEmailsFromJson = async (filePath)=>{
  const fileData = fs.readFileSync(filePath, 'utf8');
  const users = JSON.parse(fileData);
  return users.map(user => user.email); // Assuming each user object has an `email` property
}

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
  const url = `${process.env.MOODLE_URL}/login/token.php`;

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

const importUsersToAuth0 = async (token, filePath) => {
  try {
    // Read the existing user.json file
    const usersData = JSON.parse(fs.readFileSync(filePath, 'utf-8'));

    // Update each user with a generated password
    const updatedUsers = usersData.map((user) => {
      if (!user.password || user.password === '') {
        // const password = generatePassword();
        return { ...user }; // Append the password
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

const oauthUserLoginTokenApi = async (user) => {
  const url = process.env.AUTH0_TOKEN_URL;

  // Construct the request body for the OAuth token API
  const body = {
    client_id: '1Nhvu4Bnr3ki2pDStNah31Z9QiPuorfs',
    grant_type: "http://auth0.com/oauth/grant-type/password-realm",
 // Use the passed user's email
    password: user.password,
    realm: "Username-Password-Authentication",
    username: user.email,
     // Use the passed user's password
  };

  try {
    const response = await axios.post(url, new URLSearchParams(body), {
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    });
    // Return the access token and username
    return {
      username: user.email,
      access_token: response.data.access_token,
    };
  } catch (error) {
    console.error('Error fetching OAuth token for user:', user.email, error.message);
    throw error; // Re-throw the error to handle it in the calling code
  }
};


const sendDataToBoundlessAPI = async (token, matchedUsers, userData) => {

  console.log('token::', token)
  console.log('userData::', userData)

      const headers = {
        piid: userData.user_id,
        piSessionToken: token,
        apc: 'BDM',
        systemUrl: process.env.SALESFORCE_SYSTEM_URL,
        sourceSystem: 'Vanderbilt',
      };

      const body = {
        emailid: userData.email,
        familyName: userData.family_name,
        givenName: userData.given_name,
        phoneNumber: userData.phoneNumber || '',
        piid: userData.user_id,
        preferredContactMethod: ['SMS', 'Phone', 'Email'],
        utmValue: 'utm_visited=SSO',
      };

      const response = await axios.post(process.env.BOUNDLESS_API, body, { headers });
      console.log('hello users');
      console.log(`Boundless API response for ${userData.email}:`, response.data);
      return response.data;


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
  filterUsersByEmails,

};
