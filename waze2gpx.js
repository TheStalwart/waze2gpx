// https://leafletjs.com/reference.html
let map = L.map('map').setView([57.0, 24.5], 6);
L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
    maxZoom: 19,
    attribution: '&copy; <a href="http://www.openstreetmap.org/copyright">OpenStreetMap</a>'
}).addTo(map);
let geoJSONLayer = null

let parsedWazeData = null
let filteredWazeData = null
let unformattedXMLString = null

// https://github.com/placemark/togeojson
import { gpx } from "https://unpkg.com/@tmcw/togeojson?module";

window.onload = function () {
    document.getElementById('fileForm').addEventListener('change', wazeCSVFileSubmitted)
}

/**
 * Handles file form "change" event
 *
 * @param {Event} event File form event
 */
async function wazeCSVFileSubmitted(event) {
    parsedWazeData = []

    for (const fileObject of event.target.files) {
        let fileObjectTextContents = await fileObject.text()
        parsedWazeData.splice(0, 0, ...parseWazeData(fileObjectTextContents))
    }

    if (parsedWazeData.length <= 0) {
        const errorMessage = "Failed to load any trips!"
        // console.log(errorMessage);
        document.getElementById('fileFormErrorBox').innerText = errorMessage
    } else {
        // Reset any previously set upload form error messages
        document.getElementById('fileFormErrorBox').innerText = null
    }

    parsedWazeData.sort((a, b) => a.dateTime - b.dateTime)

    // There is no trip deduplication feature currently

    // console.log('parsedWazeData:', parsedWazeData);

    setupSettingsSection()
    updatePreview()
}

function setupSettingsSection() {
    document.getElementById('parsedTripCounter').innerText = parsedWazeData.length.toString()
    document.getElementById('parsedTripCounterContainer').style.display = 'block'

    if (parsedWazeData <= 0) return

    let firstTrip = parsedWazeData[0]
    let firstTripDateFormattedForInput = dateFormattedForInputTypeDateTimeLocalElement(firstTrip.dateTime)
    let lastTrip = parsedWazeData[parsedWazeData.length - 1]
    let lastTripDateFormattedForInput = dateFormattedForInputTypeDateTimeLocalElement(lastTrip.dateTime)
    document.getElementById('startDateInput').value = firstTripDateFormattedForInput
    document.getElementById('startDateInput').min = firstTripDateFormattedForInput
    document.getElementById('startDateInput').max = lastTripDateFormattedForInput
    document.getElementById('startDateInput').onchange = function () { updatePreview() }
    document.getElementById('endDateInput').value = lastTripDateFormattedForInput
    document.getElementById('endDateInput').min = firstTripDateFormattedForInput
    document.getElementById('endDateInput').max = lastTripDateFormattedForInput
    document.getElementById('endDateInput').onchange = function () { updatePreview() };

    ['start', 'end'].forEach((inputGroup) => {
        ['Prev', 'Next'].forEach((direction) => {
            let fullButtonID = `${inputGroup}${direction}TripButton`
            let buttonElement = document.getElementById(fullButtonID)

            buttonElement.onclick = function () {
                let inputElement = document.getElementById(`${inputGroup}DateInput`)
                let currentInputValue = inputElement.value
                let foundTrip = null

                // console.log(`${buttonElement.id} clicked, looking for a value ${direction} to ${currentInputValue}`)

                if (direction == 'Next') {
                    foundTrip = parsedWazeData.find((trip) => {
                        let roundedCurrentInputValue = moment.utc(currentInputValue).add(1, 'minutes') // HTML <input> drops seconds from the value, so round up selected minute value
                        return moment(trip.dateTime).isAfter(roundedCurrentInputValue)
                    })
                } else { // 'Prev'
                    foundTrip = parsedWazeData.findLast((trip) => {
                        let roundedCurrentInputValue = moment.utc(currentInputValue)
                        return moment(trip.dateTime).isBefore(roundedCurrentInputValue)
                    })
                }


                if (foundTrip) {
                    inputElement.value = dateFormattedForInputTypeDateTimeLocalElement(foundTrip.dateTime)
                    updatePreview()
                    // console.log(`found trip: ${foundTrip.dateTime}`)
                } else {
                    // console.log(`${direction} trip not found`)
                }
            };
        });
    });

    document.querySelectorAll('fieldset').forEach((fieldsetElement) => {
        fieldsetElement.disabled = false;
        fieldsetElement.onchange = function () {
            updatePreview()
        }
    });
}

function updatePreview() {
    updateFilteredWazeData()
    updateSelectedTripCounter()
    updateMapPreview()
    generateDownloadLink(unformattedXMLString, 'application/xml', 'gpx')
}

function updateFilteredWazeData() {
    filteredWazeData = parsedWazeData.filter((trip) => {
        let filterStartDate = moment.utc(document.getElementById('startDateInput').value)
        let filterEndDate = moment.utc(document.getElementById('endDateInput').value).add(1, 'minutes') // HTML <input> drops seconds from the value, so round up selected minute value

        // console.log(`filterStartDate: ${filterStartDate}, filterEndDate: ${filterEndDate}`)

        return ((trip.dateTime >= filterStartDate) && (trip.dateTime <= filterEndDate))
    });
}

function updateSelectedTripCounter() {
    document.getElementById('selectedTripCounter').innerText = filteredWazeData.length.toString()
}

function updateMapPreview() {
    unformattedXMLString = generateGPXString(filteredWazeData)
    renderGPXOnLeaflet(unformattedXMLString)
}

/**
 * Parses contents of Waze account_activity_*.csv file
 *
 * @param {string} csvString entire CSV file contents as a single string
 * @returns {{dateTime: Date; trekPoints: {dateTime?: Date; lat: string; lng: string}[]}[]} array of trips
 */
function parseWazeData(csvString) {
    const sectionStrings = csvString.split("\n\n")
    const sectionLineArrays = sectionStrings.map((sectionString) => sectionString.split("\n"));
    const locationDetailsLineArray = sectionLineArrays.find((lineArray) => lineArray[0] == 'Location details')

    if (!locationDetailsLineArray) return []

    const locationDetailsEntries = locationDetailsLineArray.slice(2)
    const locationDetailsParsedEntries = locationDetailsEntries.map((trek) => {
        let lineContents = trek.split(',')
        let dateTime = parseWazeDateTimeString(lineContents[0])
        let trekPoints = lineContents[1].split('|').map((lngLatString) => {
            /*
                There are multiple formats for trekPoints:
                - (24.237699 56.989057) // (longitude latitude)
                - 2024-02-18 10:32:03 UTC(56.9355 24.175612) // dateTime(latitude longitude)
                - 2024-09-18 18:03:04+00(24.264584 56.879377) // dateTime(longitude latitude)
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
                let lat = lngLatComponents[splitString[0].includes('+00') ? 1 : 0]
                let lon = lngLatComponents[splitString[0].includes('+00') ? 0 : 1]
                return {
                    'dateTime': dateTime,
                    'lat': lat,
                    'lng': lon,
                }
            }
        })
        return { 'dateTime': dateTime, 'trekPoints': trekPoints }
    })

    return locationDetailsParsedEntries
}

/**
 * Parse DateTime string from Waze file and return `Date` object
 * @param {String} wazeDateTimeString DateTime string from Waze file
 * @returns {Date} parsed and normalized Date object
 */
function parseWazeDateTimeString(wazeDateTimeString) {
    /*
        Waze file can contain values in different formats
        but values are always in GMT/UTC timezone
    */
    return new Date(wazeDateTimeString
        .replace(' ', 'T') // first space between date and time parts is replaced
        .replace(' GMT', 'Z')
        .replace(' UTC', 'Z')
        .replace('+00', 'Z')
    )
}

function dateFormattedForInputTypeDateElement(dateTime) {
    return `${dateTime.getUTCFullYear()}-${(dateTime.getUTCMonth() + 1).toString().padStart(2, '0')}-${dateTime.getUTCDate().toString().padStart(2, '0')}`
}

/**
 * Convert Date object to string value for use in HTML datetime-local inputs
 *
 * NB: this formatting function drops seconds
 * and resulting string value is slightly in the past from passed Date parameter
 *
 * @param {Date} dateTime
 * @returns {string} value to be used in HTML datetime-local inputs
 */
function dateFormattedForInputTypeDateTimeLocalElement(dateTime) {
    return `${dateTime.getUTCFullYear()}-${(dateTime.getUTCMonth() + 1).toString().padStart(2, '0')}-${dateTime.getUTCDate().toString().padStart(2, '0')}T${dateTime.getUTCHours().toString().padStart(2, '0')}:${dateTime.getUTCMinutes().toString().padStart(2, '0')}`
}

function generateGPXString(parsedWazeData) {
    if (parsedWazeData.length == 0) {
        return ''
    }

    let mergeTripsPreference = document.querySelector('input[name=mergeTrips]:checked').value

    let xmlHeader = '<?xml version="1.0" encoding="UTF-8"?>'

    let fileGenerationDateTime = new Date()
    let timeElement = '<time>' + fileGenerationDateTime.toISOString() + '</time>'
    let metadataElement = '<metadata>' + timeElement + '</metadata>'

    let trkElements = []

    if (mergeTripsPreference == 'trkseg') {
        /*
            Generate a single track
            with individual waze trips interpreted as track segments
        */
        let firstEntryDateTime = parsedWazeData[0].dateTime;
        let lastEntryDateTime = parsedWazeData[parsedWazeData.length - 1].dateTime;
        let trkNameElement = `<name>Waze History ${dateFormattedForInputTypeDateElement(firstEntryDateTime)} - ${dateFormattedForInputTypeDateElement(lastEntryDateTime)}</name>`
        // console.log(trkNameElement)

        let trkSegElements = parsedWazeData.map((wazeTrip) => {
            return generateTrkSegString(wazeTrip)
        })
        trkElements.push('<trk>' + trkNameElement + trkSegElements.join('') + '</trk>')
    } else { // mergeTripsPreference == 'trk'
        /*
            Generate a separate track for every waze trip
        */
        trkElements = trkElements.concat(parsedWazeData.map((wazeTrip) => {
            let trkNameElement = `<name>Waze Trip ${wazeTrip.dateTime.getUTCFullYear()}-${(wazeTrip.dateTime.getUTCMonth() + 1).toString().padStart(2, '0')}-${wazeTrip.dateTime.getUTCDate().toString().padStart(2, '0')} ${wazeTrip.dateTime.getUTCHours().toString().padStart(2, '0')}:${wazeTrip.dateTime.getUTCMinutes().toString().padStart(2, '0')}:${wazeTrip.dateTime.getUTCSeconds().toString().padStart(2, '0')}</name>`
            // console.log(trkNameElement)

            return `<trk>${trkNameElement}${generateTrkSegString(wazeTrip)}</trk>`
        }));
    }

    let gpxElement = '<gpx creator="waze2gpx - https://github.com/TheStalwart/waze2gpx" version="1.1" xmlns="http://www.topografix.com/GPX/1/1" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xsi:schemaLocation="http://www.topografix.com/GPX/1/1 http://www.topografix.com/GPX/1/1/gpx.xsd http://www.garmin.com/xmlschemas/GpxExtensions/v3 http://www.garmin.com/xmlschemas/GpxExtensionsv3.xsd http://www.garmin.com/xmlschemas/TrackPointExtension/v1 http://www.garmin.com/xmlschemas/TrackPointExtensionv1.xsd http://www.garmin.com/xmlschemas/GpxExtensions/v3 http://www.garmin.com/xmlschemas/GpxExtensionsv3.xsd http://www.garmin.com/xmlschemas/TrackPointExtension/v1 http://www.garmin.com/xmlschemas/TrackPointExtensionv1.xsd" xmlns:gpxtpx="http://www.garmin.com/xmlschemas/TrackPointExtension/v1" xmlns:gpxx="http://www.garmin.com/xmlschemas/GpxExtensions/v3">'
        + metadataElement
        + trkElements.join('')
        + '</gpx>'

    return xmlHeader + gpxElement
}

function generateTrkSegString(wazeTrip) {
    let trkptElements = wazeTrip.trekPoints.map((point) => {
        let timeValue = null
        if (point.dateTime) {
            timeValue = point.dateTime
        } else if (wazeTrip.trekPoints.indexOf(point) == 0) {
            timeValue = wazeTrip.dateTime
        }

        let timeElement = ''
        if (timeValue) {
            timeElement = '<time>' + timeValue.toISOString() + '</time>'
        }
        return `<trkpt lat="${point.lat}" lon="${point.lng}">${timeElement}</trkpt>`
    });

    return `<trkseg>${trkptElements.join('')}</trkseg>`
}

function generateFileName(extension) {
    if (filteredWazeData.length > 0) {
        let firstEntryDateTime = filteredWazeData[0].dateTime;
        let lastEntryDateTime = filteredWazeData[filteredWazeData.length - 1].dateTime;
        return `waze_history_${dateFormattedForInputTypeDateElement(firstEntryDateTime)}_${dateFormattedForInputTypeDateElement(lastEntryDateTime)}.${extension}`
    } else {
        return `waze_history_???.${extension}`
    }
}

function renderGPXOnLeaflet(gpxString) {
    // console.log(`renderGPXOnLeaflet called with gpxString: ${gpxString}`)

    if (geoJSONLayer) {
        geoJSONLayer.remove()
    }

    if (gpxString != '') {
        let geoJSONData = gpx(new DOMParser().parseFromString(gpxString, "text/xml"));
        // console.log(geoJSONData)

        generateDownloadLink(JSON.stringify(geoJSONData), 'application/json', 'geojson')
        generateDownloadLink(tokml(geoJSONData), 'application/xml', 'kml')

        geoJSONLayer = L.geoJSON(geoJSONData)
        geoJSONLayer.addTo(map)

        let bounds = geoJSONLayer.getBounds()
        if (bounds.isValid()) {
            map.fitBounds(bounds)
        }
    } else {
        generateDownloadLink('', 'application/json', 'geojson')
        generateDownloadLink('', 'application/xml', 'kml')
    }
}

function generateDownloadLink(stringData, mimeType, extension) {
    const blob = new Blob([stringData], { type: mimeType });
    // console.log(`GPX blob size: ${blob.size}`);

    const url = URL.createObjectURL(blob);
    const a = document.getElementById(`${extension}Link`);
    a.href = url;
    a.download = generateFileName(extension)
    a.textContent = a.download;
    if (blob.size > 0) {
        a.className = 'enabledFileDownloadLink'
    } else {
        a.className = 'disabledFileDownloadLink';
    }

    document.getElementById(`${extension}FileSizeSpan`).textContent = `(${(blob.size / 1024)
        .toLocaleString(undefined, {
            style: 'unit',
            unit: 'kilobyte',
            maximumFractionDigits: 0
        })})`
}
