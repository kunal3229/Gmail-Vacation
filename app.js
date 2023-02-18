const { google } = require('googleapis');
require('dotenv').config();


const oauth2Client = new google.auth.OAuth2(
    process.env.client_id,
    process.env.client_secret,
    process.env.redirect_uri
);

oauth2Client.setCredentials({
    access_token: process.env.access_token,
    refresh_token: process.env.refresh_token
});

const gmail = google.gmail({
    version: 'v1',
    auth: oauth2Client
});

let counter = 1;

async function main() {
    counter = (Math.floor(Math.random() * (120 - 45 + 1)) + 45) * 1000;
    console.log('New counter: ', counter / 1000);

    const date = new Date();
    const query = `is:unread label:inbox -category:promotions -category:social -category:updates after:${date.getDate()}/${date.getMonth() + 1}/${date.getFullYear()}`;
    
    const messageDataPromise = gmail.users.messages.list({ userId: process.env.user_id, q: query });
    const getLabelPromise = gmail.users.labels.list({ userId: process.env.user_id });

    let [messageData, labels] = await Promise.all([messageDataPromise, getLabelPromise]);
    messageData = messageData.data;
    if (!messageData.messages) {
        console.log('No new emails');
        setTimeout(main, counter);
        return;
    }
    labels = labels.data.labels.filter(label => label.name === 'Vacation Label');

    let labelId;
    if (labels.length) labelId = labels[0].id;
    else {
        labelId = (await gmail.users.labels.create({
            userId: process.env.user_id,
            requestBody: {
                name: 'Vacation Label'
            }
        })).data.id;
    }

    let getMessagePromises = [];
    for (let message of messageData.messages) {
        getMessagePromises.push(gmail.users.messages.get({
            userId: process.env.user_id,
            id: message.id,
            format: 'full'
        }));
    }
    let [headers] = await Promise.all(getMessagePromises);
    headers = headers.data.payload.headers;

    const froms = headers.filter((header) => header.name === 'From');
    for (let from of froms) {
        const content = [
            'Content-Type: text/html; charset=utf-8\r\n',
            'MIME-Version: 1.0\r\n',
            `From: ${process.env.user_id}\r\n`,
            `To: ${from.value}\r\n`,
            'Subject: I am on vacation\r\n\r\n',
            'I am on vacation please stand by.'
        ].join('');
    
        const encodedMessage = Buffer.from(content).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');

        console.log(`Sending email to: ${from.value}`)
        gmail.users.messages.send({
            userId: process.env.user_id,
            resource: { raw: encodedMessage }
        });
    }

    for (let message of messageData.messages) {
        gmail.users.messages.batchModify({
            userId: process.env.user_id,
            resource: {
                ids: message.id,
                addLabelIds: [labelId],
                removeLabelIds: ['INBOX']
            }
        });
    }

    setTimeout(main, counter);
}
setTimeout(main, counter);