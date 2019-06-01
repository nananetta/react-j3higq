import React from 'react'
import ReactNative from 'react-native'

// var React = require('react-native');
var {
    View,
    Text,
    Dimensions,
    Image,
    ImageBackground,
    Modal,
    Platform,
    Linking,
    PixelRatio
} = ReactNative

var {
    PropTypes,
} = React

import Button from 'react-native-button'
import EStyleSheet from 'react-native-extended-stylesheet'
import { NativeModules, NativeAppEventEmitter } from 'react-native'

var MapView = require('react-native-maps');

var { width, height } = Dimensions.get('window');

const ASPECT_RATIO = width / height;
const LATITUDE = 13.914561;
const LONGITUDE = 100.547020;

const LATITUDE_DELTA = 0.020;
const LONGITUDE_DELTA = LATITUDE_DELTA * ASPECT_RATIO;

const IMPACT_REGION = {
    latitude: LATITUDE,
    longitude: LONGITUDE,
    latitudeDelta: LATITUDE_DELTA,
    longitudeDelta: LONGITUDE_DELTA,
}

var ENDPOINT = `${GLOBAL.BASE_URL}parkings.php`

var subscription;

class ParkingMap extends React.Component {

    constructor(props) {
        super(props)
        this.state = {
            lang: props.lang,
            pins: [],
            selectedPinJson: {},
            pinCenterOffset: { x: 30, y: -20 },
            impactRegion: IMPACT_REGION,
            currCoords: { latitude: LATITUDE, longitude: LONGITUDE },
            nearestIdx: -1,
            modalAnimType: 'slide',
            modalVisible: false,
            showsBuilding: true,
            showsUserLocation: false,
            canOpenGoogleMaps: Platform.OS === 'android',
            canOpenAppleMaps: Platform.OS === 'ios',
        }
    }

    componentWillMount() {
        Linking.canOpenURL("comgooglemaps://").then(supported => {
            this.setState({
                canOpenGoogleMaps: supported
            })
        }).catch(err => console.error('An error occurred', err));
        this._refreshData().then(this._refreshDataTimer)
        subscription = NativeAppEventEmitter.addListener(
            NativeWrapper.EVENT_LANG_CHANGED,
            (e) => {
                console.log(e.newLang)
                this.setState({ lang: e.newLang });
                this._refreshData()
            }
        )
        NativeWrapper.logEvent(GLOBAL.PAGE_PARKING_MAP)
    }

    componentWillUnmount() {
        subscription.remove()
    }

    _refreshData = async() => {
        var ratio = PixelRatio.get();
        var paramURLSuffix = Util.genParamURLSuffix({ 'l': this.state.lang, 'x': ratio});
        var destUri = ENDPOINT + paramURLSuffix
        console.log("ENDPOINT:: "+paramURLSuffix);
        await new Promise((resolve) => {
            fetch(destUri, {
                headers: {
                    'Cache-Control': 'no-cache',
                    'Content-Type': 'application/json'
                }
            })
                .then((response) => response.json())
                .then((rjson) => {
                    console.log('ParkingMap res => ', rjson)
                    this.setState({
                        pins: rjson.pins,
                        pinCenterOffset: rjson.pinCenterOffset

                    }, resolve)
                }).catch(resolve)
        })
    }

    _refreshDataTimer = async() => {
        await new Promise(delay => setTimeout(delay, 10000))
        if (this && this._refreshData) {
            await this._refreshData()
            if (this.state.selectedPinJson && this.state.modalVisible) {
                await new Promise(resolve => {
                    const currentSelectedIndex = this.state.selectedPinJson.index
                    const selectedPin = this.state.pins[currentSelectedIndex]
                    this.setState({
                        selectedPinJson: { ...selectedPin, index: currentSelectedIndex },
                    }, resolve)
                })
            }
            this._refreshDataTimer()
        }
    }

    _setModalVisible(visible) {
        this.setState({ modalVisible: visible });
    }

    _onPressMarker = ({ data, index }) => {
        this.setState({ selectedPinJson: { ...data, index } })

        if (Platform.OS === 'ios') {
            // Must set visible to true before calling this.refs.modalView; or it'll be null otherwise
            this._setModalVisible(true);
            // this.refs.modalView.show();
        } else if (Platform.OS === 'android') {
            NativeWrapper.pushToParkingDetails(this.state.lang, data.a, data.o, data.d, data.at);
        }
    }

    _highlightNearestPin(currPos) {
        console.log("in _highlightNearestPin");
        if (this.state.pins.length < 0) {
            console.log("ERROR:No Pins")
            return;
        }

        // console.log("calc nearest pin");
        const a = currPos.coords.latitude
        const o = currPos.coords.longitude
        // console.log(a + ',' + o)
        // TODO: Verify that this.state.pin != null or empty
        // console.log(Util.getDistanceFromLatLonInKm(a,o, 13.909393,100.550532))
        var newNearestIdx = Util.getNearestAOListIndex(a, o, this.state.pins);
        console.log("Curr Idx: " + this.state.nearestIdx + " Nearest Idx: " + newNearestIdx)
        //    if (newNearestIdx >= 0 && this.state.nearestIdx != newNearestIdx) { // doesn't work on iPhone
        var nearestPin = this.state.pins[newNearestIdx]
        console.log(nearestPin)
        var newPins = this.state.pins.concat([{ a: nearestPin.a, o: nearestPin.o, d: nearestPin.d }])
        // var newPins = [{ a: nearestPin.a, o: nearestPin.o }].concat(this.state.pins)
        // nearestPin.u = ""
        //  var newPins = this.state.pins.concat(nearestPin)

        this.setState({
            nearestIdx: newNearestIdx,
            pins: newPins,
            // showsBuilding: !this.state.showsBuilding
        }, function () {
            // do something with new state
            console.log("NEW STATE SET")
        }
        )
        //    }
    }

    locateImpact() {
        this.refs.map.animateToRegion(IMPACT_REGION);
    }

    locateMe() {
        console.log("locateMe")
		if (Platform.OS === 'ios') {
	        navigator.geolocation.getCurrentPosition(
                (position) => {
                    console.log(position);
                    this._highlightNearestPin(position)
                    this.setState({ showsUserLocation: true })

                    myCurrRegion = {
                        latitude: position.coords.latitude,
                        longitude: position.coords.longitude,
                        latitudeDelta: LATITUDE_DELTA,
                        longitudeDelta: LONGITUDE_DELTA,
                    }
                    this.refs.map.animateToRegion(myCurrRegion)

                },
                (error) => alert(error.message),
                { enableHighAccuracy: true, timeout: 20000, maximumAge: 1000 }
            );
		} else if (Platform.OS === 'android') {
	        var context = this;
	        NativeWrapper.checkLocationPermission((code) => {
	            if(code == true) {
	                console.log("locateMe is allowed");
	                navigator.geolocation.getCurrentPosition((position) => {
	                    context._highlightNearestPin(position)
	                    myCurrRegion = {
	                        latitude: position.coords.latitude,
	                        longitude: position.coords.longitude,
	                        latitudeDelta: LATITUDE_DELTA,
	                        longitudeDelta: LONGITUDE_DELTA,
	                    }
	                    context.setState({ showsUserLocation: true });
	                    context.refs.map.animateToRegion(myCurrRegion)
	                },
	                (error) => alert(error.message));

	            }
	        }
	        );
		}
    }

    parseIntegerStringToNumberStringWithComma = (text) => {
        if (typeof text !== 'string') {
            return null
        }
        const number = parseInt(text)
        return number.toLocaleString()
    }

    _renderMapPin = (pinImg, txtLabel, bgColor) => {
        if (!txtLabel) {
            return (
              <Image style={styles.mapPin} source={pinImg} />
            )
        }
        return (
          <ImageBackground style={styles.mapPin} source={pinImg}>
              <View style={[styles.mapPinAvailableParkContainer, bgColor]}>
                <Text style={styles.mapPinAvailableParkLabel}>
                    {txtLabel}
                </Text>
              </View>
          </ImageBackground>
        )
    }

    _renderMapViewPin = (pin, index) => {
        // if (pin && pin.at && pin.d) {
        //   pin.d.at = pin.at
        // }
        let mapViewProps = {
            key: pin.u,
            coordinate: {
                latitude: parseFloat(pin.a),
                longitude: parseFloat(pin.o),
            },
            onPress: () => this._onPressMarker({ data: pin, index }),
            centerOffset: this.state.pinCenterOffset,
        }
        const pinImg = pin.u ? { uri: pin.u } : require('../../img/mp_border.png')

        let txtTotalAvailableParking = null
        if (typeof pin.at === 'string') {
            txtTotalAvailableParking = this.parseIntegerStringToNumberStringWithComma(pin.at)
            txtTotalAvailableParking = typeof txtTotalAvailableParking === 'string' && txtTotalAvailableParking === '0'
              ? 'Full' : txtTotalAvailableParking
        }
        const bgColor = txtTotalAvailableParking === 'Full' ? styles.bgDanger : styles.bgSuccess

        if (Platform.OS === 'android') {
            mapViewProps.image = pinImg
        }

        return (
          <MapView.Marker {...mapViewProps}>
              { this._renderMapPin(pinImg, txtTotalAvailableParking, bgColor) }
          </MapView.Marker>
        )
    }

    render() {
        return (
            <View style={styles.container}>
                <MapView
                    ref="map"
                    style={styles.map}
                    initialRegion={IMPACT_REGION}
                    showsCompass={true}
                    showsUserLocation={this.state.showsUserLocation}
                    followsUserLocation={false}
                    showsBuildings={this.state.showsBuilding}
                    // onRegionChangeComplete={this._onRegionChangeComplete.bind(this) }
                    >
                    {this.state.pins.map(this._renderMapViewPin)}
                </MapView>
                <MapButton locateType="me" locateFunc={this.locateMe.bind(this) }/>
                <MapButton locateType="impact" locateFunc={this.locateImpact.bind(this) }/>
                <Modal
                    animationType={this.state.modalAnimType}
                    transparent={true}
                    visible={this.state.modalVisible}
                    onRequestClose={() => { this._setModalVisible(false) } }
                    >
                    <MapModal
                        ref="modalView"
                        isIOS8OrLower={this.props.isIOS8OrLower}
                        visible={this.state.modalVisible}
                        onRequestClose={this._setModalVisible.bind(this, false) }
                        canOpenGoogleMaps={this.state.canOpenGoogleMaps}
                        // canOpenGoogleMaps={true}
                        canOpenAppleMaps={this.state.canOpenAppleMaps}
                        lat={parseFloat(this.state.selectedPinJson.a)}
                        lon={parseFloat(this.state.selectedPinJson.o)}
                        detailView={<ParkingDetail
                            lang={this.state.lang}
                            details={this.state.selectedPinJson.d}
                            at={this.state.selectedPinJson.at}
                            />
                        }
                        />
                </Modal>

                <View style={styles.topliner}></View>
            </View>
        );
    }
}

var styles = EStyleSheet.create({
    container: {
        position: 'absolute',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        justifyContent: 'flex-end',
        alignItems: 'center',
        flex: 1,
        width: width,
        height: height,
    },
    topliner: {
        position: 'absolute',
        width: '100%',
        height: 1,
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        backgroundColor: '#1D181C'
    },
    map: {
        position: 'absolute',
        top: 1,
        left: 0,
        right: 0,
        bottom: 0,
        flex: 1
    },
    mapPinAvailableParkContainer: {
        alignSelf: 'center',
        // marginTop: -12,
        marginTop: -19,
        paddingTop: 4,
        width: 35,
        height: 22,
    },
    bgSuccess: {
        backgroundColor: 'rgba(5, 138, 57, 1)',
    },
    bgDanger: {
        backgroundColor: 'rgba(206, 31, 40, 1)',
    },
    mapPinAvailableParkLabel: {
        color: 'white',
        fontWeight: 'bold',
        fontSize: 12,
        textAlign: 'center',
    },
    mapPin: {
        width: 45,
        height: 65
    },
    modalContainer: {
        flex: 1,
        justifyContent: 'center',
        padding: 20,
        backgroundColor: 'rgba(0, 0, 0, 0.5)',
    },
    modalDialog: {
        backgroundColor: 'white',
        borderRadius: 5,
        width: 300,
        height: 100
    },
    innerContainer: {
        borderRadius: 10,
        alignItems: 'center',
    },
    row: {
        alignItems: 'center',
        flex: 1,
        flexDirection: 'row',
        marginBottom: 20,
    },
    rowTitle: {
        flex: 1,
        fontWeight: 'bold',
    },
    button: {
        borderRadius: 5,
        flex: 1,
        height: 44,
        alignSelf: 'stretch',
        justifyContent: 'center',
        overflow: 'hidden',
    },
    buttonText: {
        fontSize: 18,
        margin: 5,
        textAlign: 'center',
    },
    modalButton: {
        marginTop: -10,
        backgroundColor: 'rgba(0, 0, 0, 0)'

    },
    labelButton: {
        color: '#1D181C'
    }
});

module.exports = ParkingMap;
