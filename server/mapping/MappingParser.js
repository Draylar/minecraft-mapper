
const fs = require('fs');
const path = require('path');
const mappingManager = require('./MappingManager.js');

const classRegex = /(class_[1-9])\d{0,}/g;

const CLASS = "c";
const METHOD = "m";
const FIELD = "f";

const mappingDirectory = "../mappings";

module.exports = {
    loadData
}

/**
 * Loads all mapping data from the ../mappings directory.
 */
function loadData() {
    for (const [key, value] of Object.entries(mappingManager.mappings)) {
        fs.readFile(path.resolve(mappingDirectory, key, "mappings.tiny"), "utf8", function read(err, data) {
            if (err) {
                console.log("If the mappings file isn't found, delete the folder and let it re-download.");
                throw err;
                // todo: do this gracefully?
            }

            // iterate over each line in the file by splitting at newline
            data.split("\n").forEach(element => {
                var splitLine = element.trim().split("	"); // remove extra spacing at back and front, split at tab character
                var type = splitLine[0];
                var version = key;

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
    };
}

/**
 * Parses and stores class information from the given data.
 * 
 * @param {String} unmapped  unmapped form of class [net/minecraft/class_1]
 * @param {String} mapped    mapped form of class [net/minecraft/entity/MyEntity]
 */
function parseClass(version, unmapped, mapped) {
    var mappings = mappingManager.getMappings(version);

    if (mappings !== undefined) {
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
    var mappings = mappingManager.getMappings(version);

    if (mappings !== undefined) {
        mappings.methods.set(unmapped, mapped);
    }
}

/**
 * Parses and stores field information from the given data.
 * 
 * @param {String} type      unmapped type as a class descriptor [Lnet/minecraft/class_2941;]
 * @param {String} unmapped  unmapped field name [field_1]
 * @param {String} mapped    mapped field name [myField]
 */
function parseField(version, type, unmapped, mapped) {
    var mappings = mappingManager.getMappings(version);

    if (mappings !== undefined) {
        mappings.fields.set(unmapped, mapped);
    }
}