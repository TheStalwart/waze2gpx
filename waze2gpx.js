document.getElementById('fileForm').addEventListener('submit', function(event) {
    event.preventDefault(); // Prevent the form from submitting the traditional way

    const fileInput = document.getElementById('fileUpload');
    const file = fileInput.files[0];
    var parsedWazeData = null

    if ( ! file) {
        const errorMessage = 'No file selected!'
        console.log(errorMessage);
        document.getElementById('fileFormErrorBox').innerText = errorMessage
        return
    }

    document.getElementById('fileFormErrorBox').innerText = null

    const reader = new FileReader();

    reader.onerror = function (e) {
        const errorMessage = 'An error occurred while reading the file: '
        console.error(errorMessage, e);
        document.getElementById('fileFormErrorBox').innerText = errorMessage + e
    };

    reader.onload = function (e) {
        // Parse Waze CSV file
        const contents = e.target.result;
        parsedWazeData = parseWazeData(contents)

        document.getElementById('generateXmlButton').addEventListener("click", function() {
            // Convert the parsed data to XML format
            var xmlContent = generateGPXString(parsedWazeData)
            if (document.getElementById('xmlFormatter').checked) {
                xmlContent = xmlFormatter(xmlContent) // very slow, therefore disabled by default
                
                // console.log('XML content:', xmlContent);

                // Preview generated XML file.
                // Do not preview if it's a one-liner compact XML
                document.getElementById('filePreview').textContent = xmlContent

                // Only highlight syntax if output is formatted
                hljs.highlightAll(); // very slow, therefore disabled by default
            }

            // Create a blob from the XML content
            const xmlBlob = new Blob([xmlContent], { type: 'application/xml' });

            // Create a download link for the XML file
            const downloadXmlLink = document.getElementById('downloadXmlLink');
            downloadXmlLink.href = URL.createObjectURL(xmlBlob);
            downloadXmlLink.download = file.name.replace('.csv', '.gpx');
            downloadXmlLink.textContent = downloadXmlLink.download;

            // Unhide GPX file link container
            document.getElementById('gpxFileLinkContainer').style.display = 'block';
        }, false);
    };

    reader.readAsText(file);
});

function parseWazeData(csvString) {
    const sectionStrings = csvString.split("\n\n")
    const sectionLineArrays = sectionStrings.map((sectionString) => sectionString.split("\n"));
    const locationDetailsEntries = sectionLineArrays.find((lineArray) => lineArray[0] == 'Location details').slice(2)
    const locationDetailsParsedEntries = locationDetailsEntries.map((trek) => {
        let lineContents = trek.split(',')
        let dateTime = parseWazeDateTimeString(lineContents[0])
        let trekPoints = lineContents[1].split('|').map((lngLatString) => {
            /*
                There are two formats for trekPoints:
                - (24.237699 56.989057) // (longitude latitude)
                - 2024-02-18 10:32:03 UTC(56.9355 24.175612) // dateTime(latitude longitude)
            */

            if (lngLatString.charAt(0) == '(') {
                let lngLatComponents = lngLatString.replaceAll(/[\(\)]/g, '').split(' ')
                return {
                    'lat': lngLatComponents[1],
                    'lng': lngLatComponents[0],
                }
            } else {
                let splitString = lngLatString.split('(')
                let dateTime = parseWazeDateTimeString(splitString[0])
                let lngLatComponents = splitString[1].replaceAll(')', '').split(' ')
                return {
                    'dateTime': dateTime,
                    'lat': lngLatComponents[0],
                    'lng': lngLatComponents[1],
                }
            }
        })
        return { 'dateTime': dateTime, 'trekPoints': trekPoints }
    })

    // console.log('Location details:', locationDetailsParsedEntries);

    return locationDetailsParsedEntries
}

/**
 * Parse DateTime string from Waze file and return `Date` object
 * @param {String} wazeDateTimeString DateTime string from Waze file
 */
function parseWazeDateTimeString(wazeDateTimeString) {
    return new Date(wazeDateTimeString
        .replace(' ', 'T')
        .replace(' GMT', 'Z') // Waze file is a mix of GMT and UTC values
        .replace(' UTC', 'Z'))
}

function generateGPXString(parsedWazeData) {
    let xmlHeader = '<?xml version="1.0" encoding="UTF-8"?>'

    let fileGenerationDateTime = new Date()
    let timeElement = '<time>' + fileGenerationDateTime.toISOString() + '</time>'
    let metadataElement = '<metadata>' + timeElement + '</metadata>'

    let trkNameElement = '<name>Waze History</name>'
    let trkSegElements = parsedWazeData.map((segment) => {
        let trkptElements = segment.trekPoints.map((point) => {
            var timeValue = null
            if (point.dateTime) {
                timeValue = point.dateTime
            } else if (segment.trekPoints.indexOf(point) == 0) {
                timeValue = segment.dateTime
            }

            var timeElement = ''
            if (timeValue) {
                timeElement = '<time>' + segment.dateTime.toISOString() + '</time>'
            }
            return `<trkpt lat="${point.lat}" lon="${point.lng}">${timeElement}</trkpt>`
        })
        
        return '<trkseg>' + trkptElements.join('') + '</trkseg>'
    })
    let trkElement = '<trk>' + trkNameElement + trkSegElements.join('') + '</trk>'

    let gpxElement = '<gpx creator="waze2gpx - https://github.com/TheStalwart/waze2gpx" version="1.1" xmlns="http://www.topografix.com/GPX/1/1" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xsi:schemaLocation="http://www.topografix.com/GPX/1/1 http://www.topografix.com/GPX/1/1/gpx.xsd http://www.garmin.com/xmlschemas/GpxExtensions/v3 http://www.garmin.com/xmlschemas/GpxExtensionsv3.xsd http://www.garmin.com/xmlschemas/TrackPointExtension/v1 http://www.garmin.com/xmlschemas/TrackPointExtensionv1.xsd http://www.garmin.com/xmlschemas/GpxExtensions/v3 http://www.garmin.com/xmlschemas/GpxExtensionsv3.xsd http://www.garmin.com/xmlschemas/TrackPointExtension/v1 http://www.garmin.com/xmlschemas/TrackPointExtensionv1.xsd" xmlns:gpxtpx="http://www.garmin.com/xmlschemas/TrackPointExtension/v1" xmlns:gpxx="http://www.garmin.com/xmlschemas/GpxExtensions/v3">'
        + metadataElement
        + trkElement
        + '</gpx>'

    return xmlHeader + gpxElement
}
