//Top level object
var dataAccess = {};

/*
Request
*/
var request = require('request');

//Retrieve kiosk-detected user from SQL web service
dataAccess.retrieveKioskUser = function(callback)
{
    var webServiceUrl = 'http://visitordemoservice.azurewebsites.net/service/personretrieve';
    request.get(webServiceUrl, function(error, response, body){
        if(!error && response.statusCode == 200)
        {
            var user = JSON.parse(body)[0];
            console.dir(user);
            callback(null, user);
        }
        else
        {
            console.log(error);
            callback(error, null);
        }
    });
}

/*
MongoDB
*/
var mongoClient = require('mongodb').MongoClient;
var connectionUrl = 'mongodb://jamesleeht:xyz123@ds054619.mlab.com:54619/bankxyzmongo';
var db;

//Called before server start in index to establish reusable connection
dataAccess.connectToDb = function(callback)
{
    mongoClient.connect(connectionUrl, function(err,database){
        if(!err)
        {
            console.log('Successfully connected to database');
            db = database;
            callback();
        }
        else
        {
            console.log(err);
            console.error('Error connecting to database');
        }
    });
}

dataAccess.getAllBranches = function(callback)
{
    db.collection('branches').find().toArray(function(err, doc){
        if(!err)
        {
            if(doc)
            {
                console.dir(doc);
            }
            else
            {
                console.error('Response not found');
            }
        }
        else
        {
            console.error('Error finding document');
        }
        callback(err, doc);
    });
}

dataAccess.getBranch = function(location, callback)
{
    db.collection('branches').findOne({"name": location}, function(err, doc){
        if(!err)
        {
            if(doc)
            {
                console.dir(doc);
            }
            else
            {
                console.error('Response not found');
            }
        }
        else
        {
            console.error('Error finding document');
        }
        callback(err, doc);
    });
}

dataAccess.createApplication = function(application)
{
    db.collection('creditapplications').insertOne(application, function(err, result){
        if(err)
        {
            console.log(err);
        }
    });
}

module.exports = dataAccess;