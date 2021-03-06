const submitButton = document.getElementById("submit");
const textField = document.getElementById("input");
const hastebinCheck = document.getElementById("hastebin");
const versionDropdown = document.getElementById("version-select");
const resultLabel = document.getElementById("result");
const SUBMIT_URL = "http://localhost:5501/submit";
const VERSIONS_URL = "http://localhost:5501/versions";

refreshVersions();

submitButton.addEventListener('click', (event) => {
    // if there are *no* versions in the dropdown, ask the server again
    if (versionDropdown.options.length == 1) {
        refreshVersions();
    }

    // if no version has been selected, set to latest
    if (versionDropdown.value == "select") {
        versionDropdown.selectedIndex = 1;

        // nodify user of mapping selector update
        versionDropdown.style.border = "1px solid #1b10b3";
        setTimeout(function () {
            versionDropdown.style.border = "1px solid #D1D1D1";
        }, 500);
    }

    const data = {
        data: textField.value,
        hastebin: hastebinCheck.checked,
        version: versionDropdown.value
    }

    // only attempt to send data if the log has text in it
    if (data.data !== "") {
        fetch(SUBMIT_URL, {
            method: 'POST',
            body: JSON.stringify(data),
            headers: {
                'content-type': 'application/json'
            }
        })
            .then(response => {
                console.log(response.status);

                // too many submit requests
                if (response.status === 429) {
                    // color notification
                    resultLabel.style.color = "red";
                    setTimeout(function () {
                        resultLabel.style.color = "black";
                    }, 500);

                    // label
                    resultLabel.textContent = "Please wait a few seconds before sending another request!";
                    throw new Error("HTTP status " + response.status);
                }

                return response.json();
            })
            .then(data => {
                // update data
                textField.value = data.log;

                // color notification
                textField.style.border = "1px solid #1b10b3";
                setTimeout(function () {
                    textField.style.border = "1px solid #D1D1D1";
                }, 500);

                // label
                resultLabel.textContent = "Succesfully mapped log.";
            });
    } else {
        // nodify user that they need to add content to input
        textField.style.border = "1px solid #b31e10";
        setTimeout(function () {
            textField.style.border = "1px solid #D1D1D1";
        }, 500);
    }
});

function refreshVersions() {
    fetch(VERSIONS_URL)
        .then(response => response.json())
        .then(data => {
            var versions = data.versions;

            versions.forEach(version => {
                var element = document.createElement("option");
                element.text = version;
                versionDropdown.add(element);
            });
        });
}