const express = require('express');
const cors = require('cors');
const rateLimit = require('express-rate-limit');
const app = express();

const mappingManager = require('./mapping/MappingManager.js');
const mappingDownloader = require('./mapping/MappingDownloader.js');
const mappingParser = require('./mapping/MappingParser.js');

app.use(cors());
app.use(express.json());
app.use('/submit/', rateLimit({
    windowMs: 10 * 1000, // 10 seconds
    max: 1 // limit each IP to 100 requests per windowMs
}));

// attempt to update mappings, then load data from files in ../mappings
mappingDownloader.updateMappings(() => {
    mappingParser.loadData();
});

// setup interval to run update & load every ~day
setInterval(() => {
    updateMappings(() => {
        loadData();
    });
}, 1000 * 60 * 60 * 24);

/**
 * Returns a list of all available mapping versions.
 */
app.get('/versions', (request, response) => {
    if (mappingManager.versions === undefined || mappingManager.versions.length == 0) {
        mappingManager.versions = [];
        for (const [key, value] of Object.entries(mappingManager.mappings)) {
            mappingManager.versions.push(key);
        }
    }

    var versions = mappingManager.versions;

    response.json({
        versions
    });
});

/**
 * Returns generic information for the root ('/') endpoint.
 */
app.get('/', (request, response) => {
    response.json({
        message: "Welcome to the API! For more information, view https://github.com/Draylar/minecraft-mapper"
    });
});

/**
 * Accepts a log from the client with version information and returns a mapped log.
 * 
 * Client data:
 *  - data -> text inputted into text box
 *  - hastebin -> 
 */
app.post('/submit', (request, response) => {
    if (isValidLog(request.body)) {
        const data = {
            log: request.body.data.toString(),
            hastebin: request.body.hastebin.toString(),
            version: request.body.version.toString(),
        };

        var mappedLog = mappingManager.mapLog(data.log, data.version);

        // success, send back mapped log
        if (data.log !== undefined) {
            response.json({
                log: mappedLog
            });
        }
        
        // failed to find version, return error
        else {
            response.json({
                log: data.log
            })
        }
    } else {
        response.status(422);
        response.json({
            message: "Minecraft log is empty/invalid."
        });
    }
});

app.listen(5501, () => {
    console.log("Minecraft Mapper online!");
});

/**
 * Returns whether or not the given log or text is valid for mapping.
 * A log is valid if it is not empty.
 * 
 * @param {string} body 
 */
function isValidLog(body) {
    return body.data && body.data.toString().trim() !== '';
}