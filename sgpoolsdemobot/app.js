/*
NPM
*/
const restify = require('restify');
const builder = require('botbuilder');
const rp = require('request-promise');

/*
Internal modules
*/
const dataAccess = require('./data_access');
const utility = require('./utility');
var logging = require('./logging');

/*
Setup
*/
//Setup restify server
var server = restify.createServer();
server.listen(process.env.port || process.env.PORT || 3978, function(){
    console.log('%s listening to %s', server.name, server.url);
});

//Setup chat bot
var connector = new builder.ChatConnector({
    appId: process.env.MICROSOFT_APP_ID,
    appPassword: process.env.MICROSOFT_APP_PASSWORD
});
var bot = new builder.UniversalBot(connector);

//Open connection to database before listening on server
dataAccess.connectToDb(function(){
    server.post('api/messages', connector.listen());
});

/*
logging
*/
/*
logging.monitor(bot, { transactions: [
    {
        intent: 'alarm.set',
        test: /^(Creating alarm named)/i
    }
]});
*/

/*
Intents
*/
//Intent dialog
var luisUrl = 'https://westus.api.cognitive.microsoft.com/luis/v2.0/apps/87b86bfb-6443-4346-b1f4-3f0d8d8be18d?subscription-key=5fcdca6bdcfa4918a3382bb68b25d54d&verbose=true&timezoneOffset=480&spellCheck=true&q=';
var luisRecognizer = new builder.LuisRecognizer(luisUrl);
var intentDialog = new builder.IntentDialog({recognizers: [luisRecognizer]});
bot.dialog('/', intentDialog);

//Intents
intentDialog.matches(/\b(register)\b/, '/suggestCardDialog'); //temporary
intentDialog.matches('Greeting', '/greetingDialog');
intentDialog.matches('Branches', '/branchesDialog');
intentDialog.matches('OpenAccount', '/openAccountDialog');
intentDialog.matches('OpeningHours', builder.DialogAction.send('We are open at all branches from 9:00AM to 5:00PM on weekdays and 9:00AM to 2:00PM on weekends.'));
intentDialog.matches('TransactionTypes', builder.DialogAction.send('The bot is to register Singapore citizens and PR for Singapre Pools.'));
intentDialog.onDefault(builder.DialogAction.send('Sorry, I didn\'t understand that.'));

/*
Dialogs
*/
bot.dialog('/greetingDialog', [
    function(session)
    {
        dataAccess.retrieveKioskUser(function(err, user){
            if(!err)
            {
                if(user.name == 'none')
                {
                    session.endDialog('Hi! Welcome to Singapore Pools. I am the bot to help you register for Singapore Pools in simple steps');
                }
                else
                {
                    session.endDialog(`Hi ${user.name}! Welcome to Singapore Pools. I am the bot to help you register for Singapore Pools in simple steps.`);
                }
            }
            else
            {
                session.endDialog('Error connecting to database');
            }
        });
    }
]);

bot.dialog('/branchesDialog', [
    function(session, args)
    {
        var intent = args.intent;
        var locationEntityWrapper = builder.EntityRecognizer.findEntity(args.entities, 'Location');
        var locationEntity;
        if(locationEntityWrapper) {locationEntity = locationEntityWrapper.entity};

        if(locationEntity)
        {
            dataAccess.getBranch(utility.capitalizeString(locationEntity), function(err, doc){
                if(!err)
                {
                    if(doc)
                    {
                        session.endDialog(`Yes, there is a branch at ${doc.name}. It's at ${doc.address}.`)
                    }
                    else
                    {
                        session.endDialog('Sorry, we don\'t have a branch there.')
                    }
                }
                else
                {
                    session.endDialog('Error connecting to database');
                }
            });
        }
        else
        {
            dataAccess.getAllBranches(function(err, doc){
                if(!err)
                {
                    if(doc)
                    {
                        var branchNameList =[];
                        for(var i=0; i<doc.length; i++)
                        {
                            branchNameList.push(doc[i].name);
                        }

                        session.endDialog(`We have branches at these places: ${branchNameList}`);
                    } 
                }
                else
                {
                    session.endDialog('Error connecting to database');
                }
            });
        }
        
    }
]);

bot.dialog('/suggestCardDialog', [
    function(session)
    {
        session.userData.applyCredit = {};

        session.send("I can see you're interested in registering with Singapore Pools.")
        builder.Prompts.choice(session, "Are you a Singapore citizen or PR?", ["Citizen", "PR"]);
    },
    function(session, results)
    {
        var choice = results.response.entity;
        session.userData.applyCredit.cardType = choice;
        
        if (choice.toUpperCase() == "CITIZEN")
        {
            builder.Prompts.confirm(session, "This won't take too long. Please have your citizen NRIC and your photo with NRIC ready. Would you like to register now?");
        }
        else if(choice.toUpperCase() == "PR")
        {
            builder.Prompts.confirm(session, "This won't take too long. Please have your permanent resident IC and your photo with NRIC ready. Would you like to register now?");
        }
        else 
        {
            builder.Prompts.confirm(session, "At this point I can only register Singapore Citizens and PR");
        }
    },
    function(session, results)
    {
        if(results.response)
        {
            session.send("Please answer these questions to complete your registration.");
            session.beginDialog('/applyCreditDialog');
        }
        else
        {
            session.endDialog("Ok, let me know if you're interested again.");
        }
    }
])

bot.dialog('/applyCreditDialog', [
    function(session)
    {
        session.beginDialog('/scanICDialog');
    },
    function(session)
    {
        builder.Prompts.text(session, "What's your phone number?");
    },
    function(session, results)
    {
        session.userData.applyCredit.phoneNumber = results.response;
        builder.Prompts.text(session, "What's your email address?");
    },
    function(session, results)
    {
        session.userData.applyCredit.email = results.response;
        session.send("Here are your details:");
        
        var detailsStr = "";
        detailsStr += "Name: " + session.userData.applyCredit.name + "\n";
        detailsStr += "IC Number: " + session.userData.applyCredit.ic + "\n";
        
        detailsStr += "Race: " + session.userData.applyCredit.race + "\n";
        detailsStr += "Date of birth: " + session.userData.applyCredit.dob + "\n";
        detailsStr += "Country of birth: " + session.userData.applyCredit.cob + "\n";
        

        detailsStr += "Phone number: " + session.userData.applyCredit.phoneNumber + "\n";
        detailsStr += "Email address: " + session.userData.applyCredit.email + "\n";
        session.send(detailsStr);

        builder.Prompts.text(session, "Confirm?");
    },
    function(session, results)
    {
        if(results.response)
        {
            dataAccess.createApplication(session.userData.applyCredit);
            session.endDialog("OK, I've submitted your application and registered you. Please do carry your IC whenever you plan to play.");
        }
        else
        {
            session.endDialog("OK, feel free to try again.");
        }
    }
]);

bot.dialog('/scanICDialog', [
    function (session)
    {
        // builder.Prompts.attachment(session, "First, upload a picture of your IC so we can retrieve your name and IC number.");
        builder.Prompts.text(session, "Upload a picture of your IC so we can retrieve your name IC number and other details.");
        //https://sgpoolstorage.blob.core.windows.net/sgpoolimg/SingaporeIC_CitizenPic1.jpg
        //https://sgpoolstorage.blob.core.windows.net/sgpoolimg/SingaporeIC_CitizenPic2.jpg
        //https://sgpoolstorage.blob.core.windows.net/sgpoolimg/SingaporeIC_CitizenPic3.jpg
        //https://sgpoolstorage.blob.core.windows.net/sgpoolimg/SingaporeIC_CitizenPic4.jpg
        //https://sgpoolstorage.blob.core.windows.net/sgpoolimg/SingaporeIC_CitizenPic6.jpg
        //https://sgpoolstorage.blob.core.windows.net/sgpoolimg/SingaporeICpic2.jpg
        //https://sgpoolstorage.blob.core.windows.net/sgpoolimg/NRIC_Han.jpg
        //https://sgpoolstorage.blob.core.windows.net/sgpoolimg/Photo_Han.jpg
    },
    function (session, results)
    {
        console.dir(session.message);
        var imgUrl = '';
        if (session.message.source === 'webchat' || session.message.source === 'directline'){
            imgUrl = session.message.attachments[0].contentUrl;
        } else {
            imgUrl = session.message.text;
        }
        processImage(imgUrl, function (res) {
            if (res.regions.length > 0)
            {
                processLines(session,res);
                session.send("Scanned IC: " + session.userData.applyCredit.ic);
                session.send("Scanned name: " + session.userData.applyCredit.name);
                
                session.send("Race: " + session.userData.applyCredit.race);
                session.send("Date of birth: " + session.userData.applyCredit.dob);
                session.send("Country of birth: " + session.userData.applyCredit.cob);
                
                session.endDialog();
            } 
            else 
            {
                session.endDialog(JSON.stringify(res));
            }
        });
    }
]);

function processImage(imgUrl, callback){
    var options = {
        url: 'https://api.projectoxford.ai/vision/v1.0/ocr?language=en&detectOrientation=true',
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Ocp-Apim-Subscription-Key': '2bc2b1b576fe4a17ac11c4bacfa530fd'
        },
        body: {
            'url': imgUrl
        },
        json:true
    };
    rp(options).then(function (body){
        // The request is successful
        callback(body);
    }).catch(function (err){
        // An error occurred and the request failed
        console.log(err.message);
        // session.send(err.message);
        callback("Something went wrong. Try again?");
    });
}
//The IC regex
var regStr = '[a-z]\\d+[a-z]';
function processLines(session, res, callback){
    var allWords=[];
    var nameLine = false;
    var icLine = false;
    var raceLine = false;
    var dobLine = false;
    var cobLine = false;

    res.regions.forEach(function (el){
        el.lines.forEach(function (line){
            var lineStr = '';
            line.words.forEach(function (word){
                var icRegex = new RegExp(regStr, "i");
                if (icRegex.test(word.text))
                {
                    session.userData.applyCredit.ic = word.text;
                }
                lineStr += word.text + ' ';
            });
            //Name
            if (nameLine)
            {
                session.userData.applyCredit.name = lineStr;
            }
            if (lineStr === 'Name ')
            {
                nameLine = true;
            } else 
            {
                nameLine = false;
            }
            // Identity
            if (icLine) {
                session.userData.applyCredit.ic = lineStr;
            }
            if (lineStr === 'Identity ') {
                icLine= true;
            } else {
                icLine = false;
            }
            // Race
            if (raceLine)
            {
                session.userData.applyCredit.race = lineStr;
            }
            if (lineStr === 'Race ') 
            {
                raceLine = true;
            } else 
            {
                raceLine = false;
            }

            // Date of birth
            if (dobLine) {
                session.userData.applyCredit.dob = lineStr;
            }
            if (lineStr === 'Date of birth ') 
            {
                dobLine = true;
            } else 
            {
                dobLine = false;
            }

            // Country of birth
            if (cobLine) {
                session.userData.applyCredit.cob = lineStr;
            }
            if (lineStr === 'Country of birth ') {
                cobLine = true;
            } else {
                cobLine = false;
            }


            allWords.push(lineStr);
        });
    });
    return allWords;
}
