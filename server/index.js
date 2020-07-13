const express = require('express');
const cors = require('cors');
const fs = require('fs');
const dir = require('node-dir');
const app = express();
const fetch = require('node-fetch');
const unzipper = require('unzipper');
const path = require('path');
const mv = require('mv');

// mapping information
const yarnVersionEndpoint = "https://meta.fabricmc.net/v2/versions/yarn";
const yarnJarURL = "https://maven.fabricmc.net/net/fabricmc/yarn/";
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

/**
 * Return generic information for the root endpoint.
 */
app.get('/', (request, response) => {
    response.json({
        message: "Welcome to the API! For more information, view https://github.com/Draylar/minecraft-mapper"
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
});

const CLASS = "c";
const METHOD = "m";
const FIELD = "f";

function loadNewData() {
    dir.readFiles(mappingDirectory,
        function (err, context, next) {
            if (err) throw err;
            console.log()
        },
        function (err, files) {
            if (err) throw err;


        }
    );
}

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

        console.log("Finished parsing data.");
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

    // console.log("Parsed class:", unmapped, mapped);
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
    // console.log("Parsed method:", unmapped, mapped);
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
    // console.log("Parsed field:", unmapped, mapped);
}

function updateMappings() {
    // todo: fetch each page (page=xyz) until page doesn't return anything
    fetch(yarnVersionEndpoint)
        .then(response => response.json())
        .then(versions => {
            var toDownload = [];

            // update, ignore, or queue download information for each version
            versions.forEach(version => {
                var dir = mappingDirectory + "/" + version.gameVersion;
                var dirFile = dir + "/info.txt";

                // check if mappings dir already exists
                if (!fs.existsSync(dir)) {
                    console.log("Creating directory for", version.gameVersion);

                    // create initial directory
                    fs.mkdirSync(dir, { recursive: true }, err => { });

                    // create info file with sha hash
                    fs.writeFile(dirFile, JSON.stringify(version, null, 2), function (err) {
                        if (err) throw err;
                        console.log("Created info file for", version.gameVersion);
                    });

                    // download game jar
                    var yarnVersion = version.gameVersion + version.separator + version.build;
                    var url = yarnJarURL + yarnVersion + "/" + "yarn-" + yarnVersion + "-v2.jar";
                    var fileDirectory = path.join(mappingDirectory, version.gameVersion);

                    const downloadInfo = {
                        url: url,
                        fileDirectory: fileDirectory,
                        fileName: version.gameVersion + ".jar",
                        baseDir: dir
                    }

                    toDownload.push(downloadInfo);
                } else {
                    // check if contents in directories are up to date
                    // each yarn file has a build version, check if each is up to date, if not, redownload jar
                }
            });

            // queue each download up
            if (toDownload.length !== 0) {
                console.log("Queuing downloads, size of", toDownload.length)
                queueDownloads(toDownload);
            }
        });
}

function queueDownloads(toDownload) {
    setTimeout(function () {
        if (toDownload.length !== 0) {
            var downloadInfo = toDownload.pop();
            console.log("Starting download for", JSON.stringify(downloadInfo));
            downloadJar(downloadInfo);

            // queue next download if needed
            if (toDownload.length !== 0) {
                queueDownloads(toDownload);
            }
        } else {
            console.log("Finished downloading all yarn jars.");
        }
    }, 1000 * 10);
}

function downloadJar(downloadInfo) {
    var url = downloadInfo.url;
    var fileDirectory = downloadInfo.fileDirectory;
    var fileName = downloadInfo.fileName;
    var baseDir = downloadInfo.baseDir;

    var jarFileLocation = path.join(fileDirectory, fileName);
    var metaInfLocation = path.join(fileDirectory, "META-INF");
    var mappingsLocation = path.join(fileDirectory, "mappings");
    var mappingsTinyLocation = path.join(fileDirectory, "mappings/mappings.tiny");
    var mappingsTinyDestination = path.join(fileDirectory, "mappings.tiny");

    download(url, jarFileLocation, () => {
        // unzip file
        fs.createReadStream(jarFileLocation)
            .pipe(unzipper.Extract({ path: fileDirectory }))
            .on('close', () => {
                console.log("Unzipped to", fileDirectory);

                // remove old jar file
                fs.unlinkSync(jarFileLocation);
                console.log("Deleted old", jarFileLocation);

                // delete META-INF folder
                fs.rmdirSync(metaInfLocation, { recursive: true });
                console.log("Deleted META-INF folder at", metaInfLocation);

                // move mappings file out
                fs.renameSync(mappingsTinyLocation, mappingsTinyDestination);
                console.log("Moved mappings.tiny file out to", mappingsTinyDestination);

                // delete mappings folder
                fs.rmdirSync(mappingsLocation, { recursive: true });
                console.log("Deleted mappings folder at", mappingsLocation);
            });
    });
}

function download(url, outputFile, callback) {
    console.log("Writing file:", url, outputFile);

    fetch(url)
        .then(response => new Promise((resolve, reject) => {
            const dest = fs.createWriteStream(outputFile);
            response.body.pipe(dest);
            dest.on('close', () => {
                callback();
                resolve();
            });
            dest.on('error', reject);
        }));
}