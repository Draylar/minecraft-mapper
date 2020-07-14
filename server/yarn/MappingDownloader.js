const fetch = require('node-fetch');
const fs = require('fs');
const path = require('path');
const unzipper = require('unzipper');

const mappingManager = require('./MappingManager.js');
const mappingParser = require('./MappingParser.js');
const MappingData = require('./MappingData');

const yarnVersionEndpoint = "https://meta.fabricmc.net/v2/versions/yarn";
const mappingDirectory = "../mappings";
const yarnJarURL = "https://maven.fabricmc.net/net/fabricmc/yarn/";

module.exports = {
    updateMappings
};

function updateMappings(callback) {
    // todo: fetch each page (page=xyz) until page doesn't return anything
    fetch(yarnVersionEndpoint)
        .then(response => response.json())
        .then(versions => {
            var toDownload = [];

            // update, ignore, or queue download information for each version
            var finishedVersions = [];
            versions.forEach(version => {
                if (!finishedVersions.includes(version.gameVersion) && version.gameVersion == "1.16.1") {
                    // add to valid version list
                    mappingManager.mappings[version.gameVersion] = new MappingData(new Map(), new Map(), new Map(), new Map());
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