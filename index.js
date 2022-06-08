const express = require('express');
const cors = require('cors');
const { MongoClient } = require('mongodb');
const ObjectId = require('mongodb').ObjectId;
require('dotenv').config()

// Twilio Package Initialized
const twilio = require('twilio')(process.env.SID, process.env.AUTH_TOKEN)

// Port Assigned
const port = process.env.PORT || 5000;

// Middleware
const app = express();
app.use(cors());
app.use(express.json());

// Mongo DB Uri
const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASS}@cluster0.be9iv.mongodb.net/${process.env.DB}?retryWrites=true&w=majority`;
const client = new MongoClient(uri, { useNewUrlParser: true, useUnifiedTopology: true });

// main function
async function run() {
    try {
        await client.connect();
        const database = client.db('OnlineVotingSystem');
        const votersCollection = database.collection('voters');
        const partiesCollection = database.collection('parties');
        const photosCollection = database.collection('electionGallery');
        const candidatesCollection = database.collection('candidates');

        //----------------- Usual Homepage -----------------
        app.get('/', (req, res) => {
            res.send('server running at 5000');
        })

        //---------------- All parties fetch ----------------
        app.get('/parties', async (req, res) => {

            const cursor = partiesCollection.find();
            const result = await cursor.toArray();

            res.json(result);
        })

        //------------ Single Party Details Fetch ------------
        app.get('/party', async (req, res) => {

            const requestedId = req.query.requestedId;
            const query = { _id: ObjectId(requestedId) };
            const result = await partiesCollection.findOne(query);

            res.json(result);
        })

        // -------------- Photo Gallery Section --------------
        app.get('/photos', async (req, res) => {

            const cursor = photosCollection.find();
            const result = await cursor.toArray();

            res.json(result);
        })

        // --------------------- Fetch Candidates -------------
        app.get('/candidates', async (req, res) => {
            const cursor = candidatesCollection.find();
            const result = await cursor.toArray();

            res.json(result);
        })

        // --------------- Single Candidate Data Fetch --------
        app.get('/candidate/:id', async (req, res) => {
            const requestedId = req.params.id;
            const query = { _id: ObjectId(requestedId) };
            const result = await candidatesCollection.findOne(query);

            res.json(result);
        })

        // ----------------- Register New Candidate ------------
        app.post('/registerCandidate', async (req, res) => {
            const newCandidate = req.body;
            const result = await candidatesCollection.insertOne(newCandidate)
            res.json(result)
        })

        // ------------- Delete Single Candidate -------------
        app.get('/candidate', async (req, res) => {
            const { deleteId } = req.query;
            const query = { _id: ObjectId(deleteId) };
            const result = await candidatesCollection.deleteOne(query);
            res.json(result)
        })

        //-------- Approve / Decline Candidate by admin --------
        app.post('/candidates', async (req, res) => {
            // console.log(req.body);
            const { type, candidateId } = req.body;
            const cursor = candidatesCollection.find();
            const query = { _id: ObjectId(candidateId) }
            const options = {
                upsert: true
            }
            const updateDoc = {
                $set: {}
            };

            if (type === 'approve') {
                updateDoc.$set = { approved: true }
            } else if (type === 'decline') {
                updateDoc.$set = { approved: false }
            } else {
                updateDoc.$set = {};
            }

            let result = await candidatesCollection.updateOne(query, updateDoc, options)
            result = await cursor.toArray();

            res.json(result)
        })

        //------------------- Login Process -----------------
        app.get('/login', async (req, res) => {
            const requestedNid = Number(req.query.nid);
            const query = { nidNumber: requestedNid }
            const result = await votersCollection.findOne(query);
            /* 
                        if (result.role === 'admin') {
                            res.json({ result, admin: true })
                        } else {
                            res.json({ result, admin: false })
                        }
                         */
            res.json(result)
        })

        // ------------------ Voter Query by nidNumber ----------
        app.get('/voter', async (req, res) => {
            const { nidNumber } = req.query;
            const query = { nidNumber: Number(nidNumber) };
            const result = await votersCollection.findOne(query)
            res.json(result)
        })

        //------------------ Register New Voters --------------
        app.post('/register', async (req, res) => {
            const receivedVoter = req.body;
            const newVoter = {
                ...receivedVoter,
                img: 'https://i.ibb.co/Xpn8wdx/user-Image.png',
                nidNumber: Number(receivedVoter.nidNumber),
                voted: false
            };
            const result = await votersCollection.insertOne(newVoter);
            res.json(result)
        })

        // ----------------- Reset Voters Status --------------
        app.get('/resetVoters', async (req, res) => {
            const filter = { voted: true };
            const updateDoc = {
                $set: { voted: false }
            }
            const options = { upsert: true }
            const result = await votersCollection.updateMany(filter, updateDoc, options);

            res.json(result)
        })

        // ------------------ Vote Granting ----------------
        app.post('/vote', async (req, res) => {
            console.log(req.body)
            const { candidateId, voterId } = req.body;
            const candidateQuery = { _id: ObjectId(candidateId) };
            const voterQuery = { _id: ObjectId(voterId) };

            const foundVoter = await votersCollection.findOne(voterQuery);

            if (foundVoter.voted != true) {
                const foundCandidate = await candidatesCollection.findOne(candidateQuery);
                const options = {
                    upsert: true
                }
                const candidateDoc = {
                    $set: {
                        voteCount: foundCandidate.voteCount + 1
                    }
                }
                const candidateResult = await candidatesCollection.updateOne(candidateQuery, candidateDoc);

                const voterDoc = {
                    $set: {
                        voted: true
                    }
                }
                const voterResult = await votersCollection.updateOne(voterQuery, voterDoc, options)
                res.json(200)
            } else {
                res.json(500)
            }
        })

        // Calculating OTP
        function calculateOtp() {
            let myOTP = 0;
            // Calculating till getting 6 digit
            while (myOTP.toString().length !== 6) {
                myOTP = Math.round(Math.random() * 1000000)
            }
            return myOTP
        }

        //OTP Verification if Face Verification Fails
        app.post('/phoneVerification', async (req, res) => {
            // console.log(req.body.phoneNumber)
            const number = req.body.phoneNumber
            const myOTP = calculateOtp();
            // const myOTP = Math.round(Math.random() * 1000000)

            // Twilio Creating Message
            await twilio.messages.create({
                from: "+18036184523",
                to: number,
                body: `Your verification code is: ${myOTP}. Use this to verify your login authentication.`
            }).then(response => {
                res.json({ sentOtp: myOTP })
            }).catch(err => res.json(err))

        })

    }
    finally {
        // await client.close();
    }
}

run().catch(console.dir)

app.listen(port, () => {
    console.log('server running on', port)
})