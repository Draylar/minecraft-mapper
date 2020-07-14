/**
 * Stores information about a game version's collection of yarn mappings.
 * Each MappingData has a Map storing information on full class names (with packages),
 *    class names (without packages), methods, and fields.
 */
class MappingData {
    /**
     * Primary constructor for {MappingData}.
     * 
     * @param {Map<String, String>} fullClasses  map between intermediary classes with package and yarn-mapped classes with package
     * @param {Map<String, String>} classes      map between intermediary class names and yarn-mapped class names
     * @param {Map<String, String>} methods      map between intermediary method names and yarn-mapped method names
     * @param {Map<String, String>} fields       map between intermediary fields and yarn-mapped field names
     */
    constructor(fullClasses, classes, methods, fields) {
        this.fullClasses = fullClasses;
        this.classes = classes;
        this.methods = methods;
        this.fields = fields;
    }
}

module.exports = MappingData;