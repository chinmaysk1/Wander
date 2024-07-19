import { Image, StyleSheet, Platform, Text, View, TextInput, TouchableOpacity, TouchableWithoutFeedback, Keyboard } from 'react-native';
import React, { useState, useEffect } from 'react';

import MapView, { Marker, Region, Polygon, Heatmap, Overlay, LatLng } from 'react-native-maps';
import * as Location from 'expo-location'
import Geocoder from 'react-native-geocoding';
import { PROVIDER_GOOGLE } from 'react-native-maps';

import AWS from 'aws-sdk';
import { Amplify } from "aws-amplify";
import { getCurrentUser } from 'aws-amplify/auth';
import { withAuthenticator } from "@aws-amplify/ui-react-native";
import awsconfig from '../../src/aws-exports';

import darkModeStyles from '../../darkMode.json';
import { useFonts } from 'expo-font';
import { SplashScreen } from 'expo-router';
import { TabBarIcon } from '@/components/navigation/TabBarIcon';

Amplify.configure(awsconfig);

Geocoder.init('AIzaSyDTcF6iZAQh6ggH_Oa3Docc_ZEsFQwMD2c');

const darkMode = darkModeStyles;


AWS.config.update({
  accessKeyId: 'THIS_KEY_IS_HIDDEN',
  secretAccessKey: 'THIS_KEY_IS_HIDDEN',
  region: 'us-west-1',
});

export const s3 = new AWS.S3();


function App() {
  const [location, setLocation] = useState<Location.LocationObject | null>(null);
  const [errorMsg, setErrorMsg] = useState(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [region, setRegion] = useState<Region | undefined>(undefined);
  const [marker, setMarker] = useState<{ latitude: number; longitude: number; title: string } | null>(null);

  const centerLatitude = location? location.coords.latitude : 0;
  const centerLongitude = location? location.coords.longitude : 0;
  const [holes, setHoles] = useState([]);
  const [username, setUsername] = useState('');

  const s3Key = `${username}/holes.json`;

  useEffect(() => {
    const fetchUsername = async () => {
      try {
        const user = await getCurrentUser();
        setUsername(user.userId);
      } catch (error) {
        console.error('Error fetching user data:', error);
      }
    };

    fetchUsername();
  }, []);



  useEffect(() => {
    (async () => {
      
      let { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') {
        setErrorMsg(errorMsg);
        return;
      }

      

      let location = await Location.getCurrentPositionAsync({});
      setLocation(location);
      setRegion({latitude: location.coords.latitude,
        longitude: location.coords.longitude,
        latitudeDelta: 0.1,
        longitudeDelta: 0.1,});
      
      const timestamp = new Date().toISOString();
      await uploadInitialHole(location.coords.latitude, location.coords.longitude, 1, timestamp);


      // Subscribe to location updates
      let locationSubscription = await Location.watchPositionAsync(
        { accuracy: Location.Accuracy.High, timeInterval: 10000, distanceInterval: 50 },
        async (location) => {
          const centerLatitude = location.coords.latitude;
          const centerLongitude = location.coords.longitude;
          const timestamp = new Date().toISOString();

          let newHole = { latitude: centerLatitude, longitude: centerLongitude, weight: 1, timestamp: timestamp };
      
          
          await addHoleToS3(newHole);
          await fetchUniqueHolesFromS3();
        }
      );
      
    })();
  }, []);

  const uploadInitialHole = async (latitude: number, longitude: number, weight: number, timestamp: string) => {
    try {
      const params = {
        Bucket: 'wanderawsbucket',
        Key: s3Key,
      };

      try {
        await s3.headObject(params).promise();
        console.log('holes.json already exists. Skipping upload.');
      } catch (headErr) {
        if (headErr instanceof Error && (headErr as any).code === 'NotFound') {
          const initialHole = { latitude, longitude, weight, timestamp };
          const putParams = {
            ...params,
            Body: JSON.stringify([initialHole]),
            ContentType: 'application/json',
          };
          await s3.putObject(putParams).promise();
          console.log('Uploaded initial holes.json.');
        } else {
          console.error('Error checking holes.json:', headErr);
        }
      }
    } catch (error) {
      console.error('Error in uploadInitialHole:', error);
    }
  };


  const fetchUniqueHolesFromS3 = async () => {
    try {
      const params = {
        Bucket: 'wanderawsbucket',
        Key: s3Key,
      };
  
      const data = await s3.getObject(params).promise();
      if (data.Body) {
        const holesData = JSON.parse(data.Body.toString());
        
        // Filter out duplicates
        const uniqueHoles = holesData.reduce((unique: any, hole: any) => {
          const isDuplicate = unique.some(
            (uniqueHole: any) =>
              uniqueHole.latitude === hole.latitude &&
              uniqueHole.longitude === hole.longitude
          );
          if (!isDuplicate) {
            unique.push(hole);
          }
          return unique;
        }, []);
  
        setHoles(uniqueHoles);
      }
    } catch (error) {
      console.error('Error fetching holes from S3:', error);
    }
  };

  const addHoleToS3 = async (newHole: {latitude: number, longitude: number, weight: number, timestamp: string}) => {
    try {
      const params = {
        Bucket: 'wanderawsbucket',
        Key: s3Key,
      };
  
      // Fetch existing holes
      const data = await s3.getObject(params).promise();
      if (data.Body) {
        let existingHoles = JSON.parse(data.Body.toString());

        existingHoles = existingHoles.filter((hole: any) =>
          typeof hole === 'object' && hole.hasOwnProperty('latitude') && hole.hasOwnProperty('longitude') && hole.hasOwnProperty('weight')
        );

  
        // Check for duplicate
        const isDuplicate = existingHoles.some((hole: {latitude: number, longitude: number, weight: number}) =>
          JSON.stringify(hole) === JSON.stringify(newHole)
        );
  
        
        // Add new hole
        existingHoles.push(newHole);

        // Update the file in S3
        const putParams = {
          ...params,
          Body: JSON.stringify(existingHoles),
          ContentType: 'application/json',
        };

        await s3.putObject(putParams).promise();
        console.log('Successfully added a new hole to holes.json.');
      }
    } catch (error) {
      console.error('Error adding hole to S3:', error);
    }
  };

  const goToCurrentLocation = () => {
    if (location) {
      setRegion({
        latitude: location.coords.latitude,
        longitude: location.coords.longitude,
        latitudeDelta: 0.1,
        longitudeDelta: 0.1,
      });
    } else {
      alert('Location not available');
    }
  };

  const handleSearch = () => {
    Geocoder.from(searchQuery)
      .then(json => {
        const location = json.results[0].geometry.location;
        const address = json.results[0].formatted_address;
        const viewport = json.results[0].geometry.viewport;

        const latitudeDelta = Math.abs(viewport.northeast.lat - viewport.southwest.lat);
        const longitudeDelta = Math.abs(viewport.northeast.lng - viewport.southwest.lng);

        setRegion({
          latitude: location.lat,
          longitude: location.lng,
          latitudeDelta,
          longitudeDelta,
        });
        setMarker({
          latitude: location.lat,
          longitude: location.lng,
          title: address,
        });
      })
      .catch(error => console.warn(error));
  };


  const clearSearch = () => {
    setSearchQuery('');
    setMarker(null);
  };






  let text = 'Waiting..';
  if (errorMsg) {
    text = errorMsg;
  } else if (location) {
    text = JSON.stringify(location);
  }

  const dismissKeyboard = () => {
    Keyboard.dismiss();
  };

 

  const [loaded] = useFonts({
    ProductSansRegular: require('../../assets/fonts/ProductSansRegular.ttf'),
  });

  useEffect(() => {
    if (loaded) {
      SplashScreen.hideAsync();
    }
  }, [loaded]);

  if (!loaded) {
    return null;
  }



  return (
    <TouchableWithoutFeedback onPress={dismissKeyboard}>
      <View style={styles.container}>
        <MapView
          style={styles.map}
          region={region}
          onRegionChangeComplete={setRegion}
          showsUserLocation={true}
          customMapStyle={darkMode}
          provider = { PROVIDER_GOOGLE }
          showsMyLocationButton = { false }
        >
        {holes.length > 0 && ( 
          <Heatmap points={holes} radius={50} opacity={0.6} gradient={{
            colors: ['#212121', '#ffffff'],
            startPoints: [0.2, 1],
            colorMapSize: 256,
          }}/>
        )}
          {marker && (
            <Marker
              coordinate={{ latitude: marker.latitude, longitude: marker.longitude }}
            >
              <Image
                source={require('../../assets/images/marker.png')}
                style={{ width: 40, height: 40 }}
              />
            </Marker>
          )}
        </MapView>
        <View style={styles.searchBar}>
          <TextInput
            style={styles.searchInput}
            placeholder={'Search here'}
            placeholderTextColor={'#a0a0a0'}
            value={searchQuery}
            onChangeText={text => setSearchQuery(text)}
            onSubmitEditing={handleSearch}
          />
          {searchQuery.length > 0 && (
            <TouchableOpacity onPress={clearSearch} style={styles.clearButton}>
              <Text style={styles.clearButtonText}>X</Text>
            </TouchableOpacity>
          )}
        </View>
        <TouchableOpacity style={styles.goToCurrentLocationButton} onPress={goToCurrentLocation}>
          <TabBarIcon name={'locate'} color={'#768fcc'} size={25} />
        </TouchableOpacity>
      </View>
    </TouchableWithoutFeedback>
  );
}


const styles = StyleSheet.create({
  container: {
    ...StyleSheet.absoluteFillObject,
    height: '100%',
    width: '100%',
    justifyContent: 'flex-end',
    alignItems: 'center',
  },
  map: {
    ...StyleSheet.absoluteFillObject,
  },
  searchBar: {
    position: 'absolute',
    top: 40,
    width: '100%',
    flexDirection: 'row',
    alignItems: 'center',
  },
  searchInput: {
    flex: 1,
    borderRadius: 50,
    marginHorizontal: 20,
    color: '#a0a0a0',
    borderColor: '#383838',
    backgroundColor: '#242424',
    borderWidth: 1,
    height: 45,
    paddingHorizontal: 20,
    fontSize: 18,
    fontFamily: 'ProductSansRegular'
  },
  clearButton: {
    position: 'absolute',
    padding: 10,
    right: 30,
    
  },
  clearButtonText: {
    color: '#a0a0a0',
    fontSize: 25,
    fontWeight: '300'
  },
  blurView: {
    position: 'absolute',
    top: 0,
    right: 0,
    left: 0,
    bottom: 0,
  },
  svgWrapper: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    width: '100%',
    height: '55%',
    aspectRatio: 1,
  },
  goToCurrentLocationButton: {
    position: 'absolute',
    bottom: 70,
    right: 20,
    width: 50,
    height: 50,
    borderRadius: 30,
    backgroundColor: '#202020',
    justifyContent: 'center',
    alignItems: 'center',
  },
  goToCurrentLocationButtonText: {
    color: '#fff',
    fontSize: 30,
    fontWeight: 'bold',
  },
});

export default App;
