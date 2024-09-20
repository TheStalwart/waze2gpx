# waze2gpx: Waze trip history to GPX converter

Extract trip history from [Waze](https://www.waze.com/company)
and convert to open [GPX](https://en.wikipedia.org/wiki/GPS_Exchange_Format), [GeoJSON](https://en.wikipedia.org/wiki/GeoJSON) and [KML](https://en.wikipedia.org/wiki/Keyhole_Markup_Language) formats.

You can try it here: [https://thestalwart.github.io/waze2gpx/](https://thestalwart.github.io/waze2gpx/)

## Discussion

- [Waze Forum thread](https://www.waze.com/forum/viewtopic.php?t=412187)

## More info

- [Waze Help: Download your personal data](https://support.google.com/waze/answer/9002354)
- [Alternative implementation in PowerShell](https://www.waze.com/forum/viewtopic.php?t=261936)
- Instructions for [Tracs - a command line application for managing GPS tracks](https://tracs.readthedocs.io/en/latest/waze/)
- [GPX Format Documentation](https://www.topografix.com/gpx.asp)

## Development environment

### Docker-based

To run a local web server at [http://127.0.0.1:3000](http://127.0.0.1:3000): `docker-compose up`

### DevContainer-based

`.devcontainer/devcontainer.json` contains a `postAttachCommand` to run a web server on port `8080`, but if it fails - run `http-server -c-1 /workspaces/waze2gpx` manually

### Local VSCode Extension

Try [Live Server](https://marketplace.visualstudio.com/items?itemName=ritwickdey.LiveServer) extension to run a web server on port `5500`
