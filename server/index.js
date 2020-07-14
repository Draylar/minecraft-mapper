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

// w -> d
const fullClassRegex = /(net.minecraft.class_[1-9])\d{0,}/g;
const shortMethodRegex = /(method_[1-9])\d{0,}/g;
const classRegex = /(class_[1-9])\d{0,}/g;
const fieldRegex = /(field_[1-9])\d{0,}/g;

// mapping data information
class MappingData {
    constructor(fullClasses, classes, methods, fields) {
        this.fullClasses = fullClasses;
        this.classes = classes;
        this.methods = methods;
        this.fields = fields;
    }
}

var mappings = new Map();

/**
 * Returns a {MappingData} with information on mappings for the given version.
 * If no mappings are found, an empty Map is returned.
 * 
 * @param {String} version   game version to retrieve mappings for.
 */
function getMappings(version) {
    return mappings[version];
}

app.use(cors());
app.use(express.json());

updateMappings(() => {
    loadData();
});

// setInterval(() => {
//     updateMappings();
//     loadData();
// }, 1000 * 60 * 60 * 24); // run every ~day

/**
 * Returns a list of all available mapping versions.
 */
app.get('/versions', (request, response) => {
    var keys = mappings.keys();

    response.json({
        keys
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

        // get version mappings
        var versionMappings = getMappings(data.version);
        if (versionMappings !== "undefined" && versionMappings.size > 0) {
            // replace full classes (net.minecraft.class_xyz)
            var fullClassMatches = data.log.match(fullClassRegex);
            if (fullClassMatches !== null) {
                fullClassMatches.forEach(match => {
                    var replacement = versionMappings.fullClasses.get(match);

                    if (replacement !== "undefined") {
                        data.log = data.log.replace(match, replacement);
                    }
                });
            }

            // replace short methods (method_xyz)
            var methodMatches = data.log.match(shortMethodRegex);
            if (methodMatches !== null) {
                methodMatches.forEach(match => {
                    var replacement = versionMappings.methods.get(match);

                    if (replacement !== "undefined") {
                        data.log = data.log.replace(match, replacement);
                    }
                });
            }

            // replace short classes (class_xyz)
            var classMatches = data.log.match(classRegex);
            if (classMatches !== null) {
                classMatches.forEach(match => {
                    var replacement = versionMappings.classes.get(match);

                    if (replacement !== "undefined") {
                        data.log = data.log.replace(match, replacement);
                    }
                });
            }

            // replace short fields
            var fieldMatches = data.log.match(fieldRegex);
            if (fieldMatches !== null) {
                fieldMatches.forEach(match => {
                    var replacement = versionMappings.fields.get(match);

                    if (replacement !== "undefined") {
                        data.log = data.log.replace(match, replacement);
                    }
                });
            }

            response.json({
                log: data.log,
                message: "Success!" // todo: http response code instead of this?
            });
        } else {
            response.json({
                log: data.log,
                message: "Failed to find version information for " + data.version
            });
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
            var version = "1.14";

            // parse data based on starting line character
            if (type == CLASS && splitLine.length == 3) {
                splitLine[1] = splitLine[1].replace(/\//g, '.');
                splitLine[2] = splitLine[2].replace(/\//g, '.');
                parseClass(version, splitLine[1], splitLine[2]);
            } else if (type == METHOD && splitLine.length == 4) {
                parseMethod(version, splitLine[1], splitLine[2], splitLine[3]);
            } else if (type == FIELD && splitLine.length == 4) {
                parseField(version, splitLine[1], splitLine[2], splitLine[3]);
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
function parseClass(version, unmapped, mapped) {
    var mappings = getMappings(version);

    if (mappings !== "undefined") {
        mappings.fullClasses.set(unmapped, mapped);

        // get short class name
        var shortClassMatch = unmapped.match(classRegex);
        var splitReplacement = mapped.split(".");
        var shortClassReplacement = splitReplacement[splitReplacement.length - 1];

        // ensure there was a match for key
        if (shortClassMatch !== null && shortClassMatch.length > 0) {
            mappings.classes.set(unmapped.match(classRegex)[0], shortClassReplacement);
        }
    }
}

/**
 * Parses and stores method information from the given data.
 * 
 * @param {String} params    unmapped method descriptor [(Lnet/minecraft/class_1;)V]
 * @param {String} unmapped  unmapped method name [method_1]
 * @param {String} mapped    mapped method name [myMethod]
 */
function parseMethod(version, params, unmapped, mapped) {
    var mappings = getMappings(version);

    if (mappings !== "undefined") {
        mappings.methods.set(unmapped, mapped);
    }

    // console.log("Parsed method:", unmapped, mapped);
}

/**
 * Parses and stores field information from the given data.
 * 
 * @param {String} type      unmapped type as a class descriptor [Lnet/minecraft/class_2941;]
 * @param {String} unmapped  unmapped field name [field_1]
 * @param {String} mapped    mapped field name [myField]
 */
function parseField(version, type, unmapped, mapped) {
    var mappings = getMappings(version);

    if (mappings !== "undefined") {
        mappings.fields.set(unmapped, mapped);
    }

    // console.log("Parsed field:", unmapped, mapped);
}

function updateMappings(callback) {
    // todo: fetch each page (page=xyz) until page doesn't return anything
    fetch(yarnVersionEndpoint)
        .then(response => response.json())
        .then(versions => {
            var toDownload = [];

            // update, ignore, or queue download information for each version
            var finishedVersions = [];
            versions.forEach(version => {
                if (!finishedVersions.includes(version.gameVersion)) {
                    // add to valid version list
                    mappings[version.gameVersion] = new MappingData(new Map(), new Map(), new Map(), new Map());
                    finishedVersions.push(version.gameVersion);

                    var versionDir = mappingDirectory + "/" + version.gameVersion;
                    var versionInfoFile = versionDir + "/info.txt";

                    // check if mappings dir already exists
                    if (!fs.existsSync(versionDir)) {
                        console.log("Creating directory for", version.gameVersion);
                        populateDirectory(versionDir, versionInfoFile, version, toDownload);
                    } else {
                        // check if contents in directories are up to date
                        // each yarn file has a build version, check if each is up to date, if not, redownload jar
                        var data = fs.readFileSync(versionInfoFile, "utf-8");

                        var currentBuild = JSON.parse(data).build;
                        var latestBuild = version.build;

                        // check if cached version and maven version do not match
                        if (latestBuild !== currentBuild) {
                            console.log("Versions don't match, updating", version.gameVersion, currentBuild, latestBuild);
                            populateDirectory(versionDir, versionInfoFile, version, toDownload);
                        }
                    }
                }
            });

            // queue each download up
            if (toDownload.length !== 0) {
                console.log("Queuing downloads, size of", toDownload.length)
                queueDownloads(toDownload, callback);
            } else {
                callback();
            }
        });
}

function populateDirectory(versionDir, versionInfoFile, version, toDownload) {
    fs.mkdirSync(versionDir, { recursive: true }, err => { });

    // create info file with sha hash
    fs.writeFile(versionInfoFile, JSON.stringify(version, null, 2), function (err) {
        if (err)
            throw err;
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
        baseDir: versionDir
    };

    toDownload.push(downloadInfo);
}

function queueDownloads(toDownload, callback) {
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
            callback();
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