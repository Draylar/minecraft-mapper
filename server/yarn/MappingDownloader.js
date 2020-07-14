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

/**
 * Attempts to update the mapping folders found in ../mappings.
 * If the given mappings already exist & are up-to-date, no downloading occurs.
 * 
 * @param {function} callback  logic to run after all mappings have been downloaded & updated
 */
function updateMappings(callback) {
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
                        refreshDirectory(versionDir, versionInfoFile, version, toDownload);
                    } else {
                        // check if contents in directories are up to date
                        // each yarn file has a build version, check if each is up to date, if not, redownload jar
                        var data = fs.readFileSync(versionInfoFile, "utf-8");

                        var currentBuild = JSON.parse(data).build;
                        var latestBuild = version.build;

                        // check if cached version and maven version do not match
                        if (latestBuild !== currentBuild) {
                            console.log("Versions don't match, updating", version.gameVersion, currentBuild, latestBuild);
                            refreshDirectory(versionDir, versionInfoFile, version, toDownload);
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

/**
 * Prepares a directory for downloading mappings.
 * If the directory does not exist, it is created before downloading version content.
 * An info file (info.txt) is either created or updated inside the directory.
 * 
 * @param {String} versionDir        directory folder of version (1.16 -> ../mappings/1.16/)
 * @param {String} versionInfoFile   location of versions' info.txt file (1.16 -> ../mappings/1.16/info.txt)
 * @param {String} version           game version
 * @param {String[]} toDownload      mutable array to add directory information to, used once all directories have been prepared
 */
function refreshDirectory(versionDir, versionInfoFile, version, toDownload) {
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
        fileName: version.gameVersion + ".jar"
    };

    toDownload.push(downloadInfo);
}

/**
 * Downloads & extracts mapping jars for each version in the toDownload list.
 * Each download is separated by a 10 second pause to prevent stressing the Fabric maven.
 * After finishing, the callback is ran.
 * 
 * @param {any[]} toDownload  list of information on versions to download
 * @param {function} callback    code to run after all downloads have completed
 */
function queueDownloads(toDownload, callback) {
    setTimeout(function () {
        if (toDownload.length !== 0) {
            var downloadInfo = toDownload.pop();
            console.log("Starting download for", JSON.stringify(downloadInfo));
            downloadMappings(downloadInfo);

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

/**
 * Downloads mappings based on the given information.
 * The downloaded jar is unzipped, the contents are pulled out, and the original jar/unzipped-folder are deleted.
 * 
 * @param {any} downloadInfo 
 */
function downloadMappings(downloadInfo) {
    var url = downloadInfo.url;
    var fileDirectory = downloadInfo.fileDirectory;
    var fileName = downloadInfo.fileName;

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

/**
 * Downloads the file at the given URL to the outputFile location, then runs the callback.
 * 
 * @param {string} url         URL to download file from
 * @param {string} outputFile  location to download file to
 * @param {function} callback  code to run after finishing
 */
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