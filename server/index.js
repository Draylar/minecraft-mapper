const express = require('express');
const cors = require('cors');
const fs = require('fs');
const dir = require('node-dir');
const app = express();
const fetch = require("node-fetch");

// mapping information
const githubBranchEndpoint = "https://meta.fabricmc.net/v2/versions/yarn";
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

// updateMappings();
loadData();

// setInterval(() => {
//     updateMappings();
//     loadData();
// }, 1000 * 60 * 60 * 24); // run every ~day

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

                if (replacement !== "undefined") {
                    data.log = data.log.replace(match, replacement);
                }
            });
        }

        // replace short methods (method_xyz)
        var methodMatches = data.log.match(shortMethodRegex);
        if (methodMatches !== null) {
            methodMatches.forEach(match => {
                var replacement = methods.get(match);

                if (replacement !== "undefined") {
                    data.log = data.log.replace(match, replacement);
                }
            });
        }

        // replace short classes (class_xyz)
        var shortClassMatches = data.log.match(shortClassRegex);
        if (shortClassMatches !== null) {
            shortClassMatches.forEach(match => {
                var replacement = shortClasses.get(match);

                if (replacement !== "undefined") {
                    data.log = data.log.replace(match, replacement);
                }
            });
        }

        // replace short fields
        var shortFieldMatches = data.log.match(shortFieldRegex);
        if (shortFieldMatches !== null) {
            shortFieldMatches.forEach(match => {
                var replacement = fields.get(match);

                if (replacement !== "undefined") {
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

const CLASS = "c";
const METHOD = "m";
const FIELD = "f";

function loadData() {
    fs.readFile("mappings/mappings.tiny", "utf8", function read(err, data) {
        if (err) throw err;

        // iterate over each line in the file by splitting at newline
        data.split("\n").forEach(element => {
            var splitLine = element.trim().split("	"); // remove extra spacing at back and front, split at tab character
            var type = splitLine[0];

            // parse data based on starting line character
            if (type == CLASS && splitLine.length == 3) {
                splitLine[1] = splitLine[1].replace(/\//g, '.');
                splitLine[2] = splitLine[2].replace(/\//g, '.');
                parseClass(splitLine[1], splitLine[2]);
            } else if (type == METHOD && splitLine.length == 4) {
                parseMethod(splitLine[1], splitLine[2], splitLine[3]);
            } else if (type == FIELD && splitLine.length == 4) {
                parseField(splitLine[1], splitLine[2], splitLine[3]);
            }

        });

        console.log("Done");
    });
}

/**
 * Parses and stores class information from the given data.
 * 
 * @param {String} unmapped  unmapped form of class [net/minecraft/class_1]
 * @param {String} mapped    mapped form of class [net/minecraft/entity/MyEntity]
 */
function parseClass(unmapped, mapped) {
    fullClasses.set(unmapped, mapped);

    // get short class name
    var shortClassMatch = unmapped.match(shortClassRegex);
    var splitReplacement = mapped.split(".");
    var shortClassReplacement = splitReplacement[splitReplacement.length - 1];

    // ensure there was a match for key
    if (shortClassMatch !== null && shortClassMatch.length > 0) {
        shortClasses.set(unmapped.match(shortClassRegex)[0], shortClassReplacement);
    }

    console.log("Parsed class: ", unmapped, mapped);
}

/**
 * Parses and stores method information from the given data.
 * 
 * @param {String} params    unmapped method descriptor [(Lnet/minecraft/class_1;)V]
 * @param {String} unmapped  unmapped method name [method_1]
 * @param {String} mapped    mapped method name [myMethod]
 */
function parseMethod(params, unmapped, mapped) {
    methods.set(unmapped, mapped);
    console.log("Parsed method: ", unmapped, mapped);
}

/**
 * Parses and stores field information from the given data.
 * 
 * @param {String} type      unmapped type as a class descriptor [Lnet/minecraft/class_2941;]
 * @param {String} unmapped  unmapped field name [field_1]
 * @param {String} mapped    mapped field name [myField]
 */
function parseField(type, unmapped, mapped) {
    fields.set(unmapped, mapped);
    console.log("Parsed field: ", unmapped, mapped);
}

function updateMappings() {
    // todo: fetch each page (page=xyz) until page doesn't return anything
    fetch(githubBranchEndpoint)
        .then(response => response.json())
        .then(versions => {
            versions.forEach(version => {
                var dir = mappingDirectory + "/" + version.gameVersion;
                var dirFile = dir + "/info.txt";

                // check if mappings dir already exists
                if (!fs.existsSync(dir)) {
                    console.log("Creating directory for ", version.gameVersion);

                    // create initial directory
                    fs.mkdirSync(dir, { recursive: true }, err => { });

                    // create info file with sha hash
                    fs.writeFile(dirFile, JSON.stringify(version, null, 2), function (err) {
                        if (err) throw err;
                        console.log("Created info file for ", version.gameVersion);
                    })
                } else {
                    // check if contents in directories are up to date

                }
            });
        });



    console.log("Mappings pulled from GitHub!");
}