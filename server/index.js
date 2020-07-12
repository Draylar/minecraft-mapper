const express = require('express');
const cors = require('cors');
const fs = require('fs');
const dir = require('node-dir');
const app = express();
const fetch = require("node-fetch");

// mapping information
const githubBranchEndpoint = "https://api.github.com/repos/FabricMC/yarn/branches";
const mappingDirectory = "../mappings";

var fullClasses = new Map();
var shortClasses = new Map();
var methods = new Map();
var fields = new Map();

var mappingVersions = [
    "1.16.1",
    "1.16"
];

// w -> d
const fullClassRegex = /(net.minecraft.class_[1-9])\d{0,}/g;
const shortMethodRegex = /(method_[1-9])\d{0,}/g;
const shortClassRegex = /(class_[1-9])\d{0,}/g;
const shortFieldRegex = /(field_[1-9])\d{0,}/g;

app.use(cors());
app.use(express.json());

updateMappings();
loadData();

setInterval(() => {
    updateMappings();
    loadData();
}, 1000 * 60 * 60 * 24); // run every ~day

/**
 * Returns a list of all available mapping versions.
 */
app.get('/versions', (request, response) => {
    response.json({
        mappingVersions
    });
});

app.get('/', (request, response) => {
    response.json({
        message: "Welcome to the API!"
    });
});

function isValidLog(body) {
    return body.data && body.data.toString().trim() !== '';
}

app.post('/submit', (request, response) => {
    if (isValidLog(request.body)) {
        const data = {
            log: request.body.data.toString(),
            hastebin: request.body.hastebin.toString(),
            version: request.body.version.toString(),
        };

        // replace full classes (net.minecraft.class_xyz)
        var classMatches = data.log.match(fullClassRegex);
        if (classMatches !== null) {
            classMatches.forEach(match => {
                var replacement = fullClasses.get(match);

                if(replacement !== "undefined") {
                    data.log = data.log.replace(match, replacement);
                }
            });
        }

        // replace short methods (method_xyz)
        var methodMatches = data.log.match(shortMethodRegex);
        if (methodMatches !== null) {
            methodMatches.forEach(match => {
                var replacement = methods.get(match);

                if(replacement !== "undefined") {
                    data.log = data.log.replace(match, replacement);
                }
            });
        }

        // replace short classes (class_xyz)
        var shortClassMatches = data.log.match(shortClassRegex);
        if (shortClassMatches !== null) {
            shortClassMatches.forEach(match => {
                var replacement = shortClasses.get(match);
                
                if(replacement !== "undefined") {
                    data.log = data.log.replace(match, replacement);
                }
            });
        }

        // replace short fields
        var shortFieldMatches = data.log.match(shortFieldRegex);
        if (shortFieldMatches !== null) {
            shortFieldMatches.forEach(match => {
                var replacement = fields.get(match);

                if(replacement !== "undefined") {
                    data.log = data.log.replace(match, replacement);
                }
            });
        }

        response.json({
            log: data.log
        });
    } else {
        response.status(422);
        response.json({
            message: "Minecraft log is empty/invalid."
        });
    }
});

app.listen(5501, () => {
    console.log("Minecraft Mapper online!");
})

function loadData() {
    dir.readFiles(
        "mappings",
        function (err, content, next) {
            if (err) throw err;

            content.split("\n").forEach(element => {
                var splitLine = element.trim().split(" ");
                var type = splitLine[0];

                // todo: this does not support inner-classes (they don't start with net/minecraft)
                if (splitLine.length > 2 && (type == "CLASS" && splitLine[1].includes("net/minecraft/") || type !== "CLASS")) {
                    splitLine[1] = splitLine[1].replace(/\//g, '.');
                    splitLine[2] = splitLine[2].replace(/\//g, '.');

                    if (type == "CLASS") {
                        fullClasses.set(splitLine[1], splitLine[2]);

                        // get short class name
                        var shortClassMatch = splitLine[1].match(shortClassRegex);
                        var splitReplacement = splitLine[2].split(".");
                        var shortClassReplacement = splitReplacement[splitReplacement.length - 1];

                        // ensure there was a match for key
                        if(shortClassMatch !== null && shortClassMatch.length > 0) {
                            shortClasses.set(splitLine[1].match(shortClassRegex)[0], shortClassReplacement);
                        }
                    } else if (type == "METHOD") {
                        methods.set(splitLine[1], splitLine[2]);
                    } else if (type == "FIELD") {
                        fields.set(splitLine[1], splitLine[2]);
                    }
                }
            });

            next();
        },
        function (err, files) {
            if (err) throw err;
            console.log('Finished reading mapping files.');
        }
    )
}

function updateMappings() {
    // todo: fetch each page (page=xyz) until page doesn't return anything
    fetch(githubBranchEndpoint)
        .then(response => response.json())
        .then(versions => {
            versions.forEach(version => {
                var dir = mappingDirectory + "/" + version.name;
                var dirFile = dir + "/info.txt";

                if(!fs.existsSync(dir)) {
                    console.log("Creating directory for ", version.name);

                    // create initial directory
                    fs.mkdirSync(dir)

                    // download contents
                    fs.writeFile(dirFile, )
                } else {
                    // check if contents in directories are up to date

                }
            });
        });

    

    console.log("Mappings pulled from GitHub!");
}