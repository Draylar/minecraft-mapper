var mappings = new Map();
var versions = undefined;

const fullClassRegex = /(net.minecraft.class_[0-9$]*)/g; // used for finding full class statements in game code
const shortMethodRegex = /(method_[1-9])\d{0,}/g;
const fieldRegex = /(field_[1-9])\d{0,}/g;
const classRegex = /(class_[0-9$]*)/g;

module.exports = {
    mappings,
    versions,
    getMappings,
    mapLog
}

/**
 * Returns a {MappingData} with information on mappings for the given version.
 * If no mappings are found, an empty Map is returned.
 * 
 * @param {String} version   game version to retrieve mappings for.
 */
function getMappings(version) {
    return mappings[version];
}

/**
 * Maps the given intermediary log or text with the given version's mappings.
 * If the given version has no mappings for it, undefined is returned.
 * 
 * @param {string} log      log or intermediary code to map to yarn
 * @param {string} version  yarn mapping version
 */
function mapLog(log, version) {
    // get version mappings
    var versionMappings = getMappings(version);
    if (versionMappings !== undefined) {
        // replace full classes (net.minecraft.class_xyz)
        var fullClassMatches = log.match(fullClassRegex);
        if (fullClassMatches !== null) {
            fullClassMatches.forEach(match => {
                var replacement = versionMappings.fullClasses.get(match);

                if (replacement !== undefined) {
                    log = log.replace(match, replacement);
                }
            });
        }

        // replace short methods (method_xyz)
        var methodMatches = log.match(shortMethodRegex);
        if (methodMatches !== null) {
            methodMatches.forEach(match => {
                var replacement = versionMappings.methods.get(match);

                if (replacement !== undefined) {
                    log = log.replace(match, replacement);
                }
            });
        }

        // replace short classes (class_xyz)
        var classMatches = log.match(classRegex);
        if (classMatches !== null) {
            classMatches.forEach(match => {
                var replacement = versionMappings.classes.get(match);

                if (replacement !== undefined) {
                    log = log.replace(match, replacement);
                }
            });
        }

        // replace short fields
        var fieldMatches = log.match(fieldRegex);
        if (fieldMatches !== null) {
            fieldMatches.forEach(match => {
                var replacement = versionMappings.fields.get(match);

                if (replacement !== undefined) {
                    log = log.replace(match, replacement);
                }
            });
        }

        return log;
    } else {
        return undefined;
    }
}