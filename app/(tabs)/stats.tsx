import { Image, StyleSheet, Platform, Text, View, TextInput, TouchableOpacity, TouchableWithoutFeedback, Keyboard } from 'react-native';
import React, { useState, useEffect, useRef } from 'react';
import { s3 } from './index';
import AWS from 'aws-sdk';
import { getCurrentUser } from 'aws-amplify/auth';
import { Picker } from '@react-native-picker/picker';
import { SplashScreen } from 'expo-router';
import { useFonts } from 'expo-font';

import { BarChart, LineChart, PieChart, PopulationPyramid, yAxisSides } from "react-native-gifted-charts";
import { Color } from 'aws-cdk-lib/aws-cloudwatch';
import { screenWidth } from 'react-native-gifted-charts/src/utils';
import { float } from 'aws-sdk/clients/cloudfront';
import * as Location from 'expo-location';
import statesData from './us_states.json';

interface Hole {
    latitude: number;
    longitude: number;
    timestamp: string; // Assuming timestamp is a string for this example
}

export default function Stats() {
    const [holes, setHoles] = useState([]);
    const [username, setUsername] = useState('');
    const [selectedMonthYear, setSelectedMonthYear] = useState('Choose month');
    const [totalDistance, setTotalDistance] = useState('0');
    const [barData, setBarData] = useState<Array<{ value: float; label: string; }>>(() => {      
        // Initialize bar data with 28 objects
        const initialData = Array.from({ length: 28 }, (_, index) => ({
          value: 1,
          label: index in [1, 8, 15, 22] ? `${index + 1}` : ''
        }));
      
        return initialData;
    });
    const [currentState, setCurrentState] = useState<string | null>(null);
    const [stateSquareMiles, setStateSquareMiles] = useState(0);
    const [percentState, setPercentState] = useState(0);
    const [area, setArea] = useState(0);
    

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
        const fetchHolesFromS3 = async () => {
            try {
                const params = {
                    Bucket: 'wanderawsbucket',
                    Key: s3Key,
                };
        
                const data = await s3.getObject(params).promise();
                if (data.Body) {
                    const holesData = JSON.parse(data.Body.toString());
                    setHoles(holesData);
                }
            } catch (error) {
                console.error('Error fetching holes from S3:', error);
            } finally {
                const uniqueHoles = filterUniqueHoles(holes);
                const areaDiscovered = (Math.PI * 0.621371 * 0.621371 * uniqueHoles.length); // pi*r^2 * number of holes, where r = 1km or 0.621371mi
                const percentStateDiscovered = (areaDiscovered / stateSquareMiles) * 100;
            
                setArea(parseFloat(areaDiscovered.toFixed(2)));
                setPercentState(parseFloat(percentStateDiscovered.toFixed(4)));
                console.log(area)
            }
        };

        fetchHolesFromS3();

    }, []);

    // Available months and years
    const availableMonthsYears = holes.map((hole: any) => {
        const date = new Date(hole.timestamp);
        return {
            month: date.getMonth(),
            year: date.getFullYear()
        };
    }).filter((value, index, self) =>
        index === self.findIndex((t) => (
            t.month === value.month && t.year === value.year
        ))
    );

    const calculateTotalDistance = (holes: any[]) => {
        if (holes.length < 2) return 0;

        const toRadians = (degrees: number) => degrees * (Math.PI / 180);

        const calculateDistance = (lat1: number, lon1: number, lat2: number, lon2: number) => {
            const R = 6371; // Radius of the Earth in kilometers
            const dLat = toRadians(lat2 - lat1);
            const dLon = toRadians(lon2 - lon1);
            const a =
                Math.sin(dLat / 2) * Math.sin(dLat / 2) +
                Math.cos(toRadians(lat1)) * Math.cos(toRadians(lat2)) *
                Math.sin(dLon / 2) * Math.sin(dLon / 2);
            const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
            const distanceKm = R * c; // Distance in kilometers
            const distanceMiles = distanceKm * 0.621371; // Convert kilometers to miles
            return distanceMiles;
        };

        let totalDistance = 0;
        for (let i = 1; i < holes.length; i++) {
            const { latitude: lat1, longitude: lon1 } = holes[i - 1];
            const { latitude: lat2, longitude: lon2 } = holes[i];
            totalDistance += calculateDistance(lat1, lon1, lat2, lon2);
        }

        return totalDistance;
    };

    const findLatestMonthYear = () => {
        let latestDate = new Date('1970-01-01');
    
        // Iterate through the holes array to find the maximum date
        holes.forEach(hole => {
            const currentDate = new Date(hole['timestamp']);
            if (currentDate > latestDate) {
                latestDate = currentDate;
            }
        });
            
        const dateData = (latestDate.getMonth() + '-' + latestDate.getFullYear());
        return dateData;
    }

    useEffect(() => {
        const latestMonthYear = findLatestMonthYear();
        if (selectedMonthYear != 'Choose month') {
            const [selectedMonth, selectedYear] = selectedMonthYear.split('-').map(Number);
            const filteredHoles = holes.filter((hole: any) => {
                const date = new Date(hole.timestamp);
                return date.getMonth() === selectedMonth && date.getFullYear() === selectedYear;
            });
            const totalDistance = calculateTotalDistance(filteredHoles);
            setTotalDistance(totalDistance.toFixed(2));

            setBarData(getMilesTravelledPerDay(holes, selectedMonthYear));
        }
    }, [selectedMonthYear, holes]);

    useEffect(() => {
        const fetchUserLocation = async () => {
            let { status } = await Location.requestForegroundPermissionsAsync();
            if (status !== 'granted') {
                console.error('Location permission denied');
                return;
            }

            let location = await Location.getCurrentPositionAsync({});
            const { latitude, longitude } = location.coords;

            // Get state from coordinates
            let address = await Location.reverseGeocodeAsync({ latitude, longitude });
            if (address && address.length > 0) {
                const stateName = address[0].region; // Adjust based on the response structure from reverse geocoding
                setCurrentState(stateName);

                // Find square miles for the state
                let state = statesData.find(state => state.state === stateName);
                if (state) {
                    setStateSquareMiles(state.sq_mi);
                }
            }
        };

        fetchUserLocation();
    }, []);

    useEffect(() => {
        
    }, []);


    const getMilesTravelledPerDay = (holes: any, selectedMonthYear: string) => {
        // Helper function to calculate distance between two coordinates (Haversine formula)
        const haversineDistance = (coords1: any, coords2: any) => {
          const toRadians = (degrees: any) => degrees * (Math.PI / 180);
          const [lat1, lon1] = coords1;
          const [lat2, lon2] = coords2;
      
          const R = 3958.8; // Radius of the Earth in miles
          const dLat = toRadians(lat2 - lat1);
          const dLon = toRadians(lon2 - lon1);
          const a = Math.sin(dLat / 2) ** 2 +
                    Math.cos(toRadians(lat1)) * Math.cos(toRadians(lat2)) * Math.sin(dLon / 2) ** 2;
          const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
          return R * c;
        };
      
        // Extract month and year from selectedMonthYear
        const [selectedMonth, selectedYear] = selectedMonthYear.split('-').map(Number);
      
        // Filter holes for the selected month and year
        const filteredHoles = holes.filter((hole: any) => {
          const date = new Date(hole.timestamp);
          return date.getMonth() === selectedMonth && date.getFullYear() === selectedYear;
        });
      
        // Calculate miles travelled per day
        const milesPerDay: any = {};
      
        filteredHoles.forEach((hole: any, index: any, arr: any) => {
          const date = new Date(hole.timestamp).getDate();
          if (!milesPerDay[date]) {
            milesPerDay[date] = 0;
          }
          if (index > 0) {
            const prevHole = arr[index - 1];
            const prevDate = new Date(prevHole.timestamp).getDate();
            if (date === prevDate) {
              const distance = haversineDistance(
                [prevHole.latitude, prevHole.longitude],
                [hole.latitude, hole.longitude]
              );
              milesPerDay[date] += distance;
            }
          }
        });

        // Add missing days with 0 miles
        const daysInMonth = new Date(selectedYear, selectedMonth + 1, 0).getDate(); // Get the number of days in the month
        for (let day = 1; day <= daysInMonth; day++) {
            if (!milesPerDay[day]) {
            milesPerDay[day] = 0;
            }
        }
      
        // Convert the result to the desired format
        const result = Object.keys(milesPerDay).map(day => ({
            value: parseFloat(milesPerDay[day].toFixed(2)), // rounding to 2 decimal places for clarity
            label: [1, 8, 15, 22, 29].includes(parseInt(day, 10)) ? day : ''
          }));
      
        return result;
      };

      function calculateDailyAverage(barData: any) {
        if (barData.length === 0) {
          return 0; // Handle edge case where barData is empty
        }
      
        // Calculate the sum of all values
        const sum = barData.reduce((acc: any, dataPoint: { value: any; }) => acc + dataPoint.value, 0);

        let latestDate = new Date('1970-01-01');

        // Iterate through the holes array to find the maximum date
        holes.forEach(hole => {
            const currentDate = new Date(hole['timestamp']);
            if (currentDate > latestDate) {
                latestDate = currentDate;
            }
        });
        
        const latestDateInt = (latestDate+'').split(' ')[2];
      
        // Calculate the average
        return parseFloat((sum / parseInt(latestDateInt)).toFixed(1));
      }



      function calculateDistance(lat1: number, lon1: number, lat2: number, lon2: number): number {
        const R = 6371e3; // Earth radius in meters
        const φ1 = lat1 * Math.PI / 180;
        const φ2 = lat2 * Math.PI / 180;
        const Δφ = (lat2 - lat1) * Math.PI / 180;
        const Δλ = (lon2 - lon1) * Math.PI / 180;
    
        const a = Math.sin(Δφ / 2) * Math.sin(Δφ / 2) +
                  Math.cos(φ1) * Math.cos(φ2) *
                  Math.sin(Δλ / 2) * Math.sin(Δλ / 2);
        const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    
        const distance = R * c; // Distance in meters
        return distance;
    }
    
    // Function to filter unique holes based on a 50m radius
    function filterUniqueHoles(holes: Hole[]): Hole[] {
        const uniqueHoles: Hole[] = [];
    
        // Iterate through each hole
        for (let i = 0; i < holes.length; i++) {
            let isUnique = true;
            const currentHole = holes[i];
    
            // Compare current hole with others
            for (let j = 0; j < holes.length; j++) {
                if (i !== j) {
                    const comparedHole = holes[j];
                    const distance = calculateDistance(
                        currentHole.latitude, currentHole.longitude,
                        comparedHole.latitude, comparedHole.longitude
                    );
    
                    // Check if within 50 meters
                    if (distance <= 500) {
                        isUnique = false;
                        break;
                    }
                }
            }
    
            // If unique, add to uniqueHoles array
            if (isUnique) {
                uniqueHoles.push(currentHole);
            }
        }
    
        return uniqueHoles;
    }









    const [loaded] = useFonts({
        ProductSansRegular: require('../../assets/fonts/ProductSansRegular.ttf'),
        ProductSansBold: require('../../assets/fonts/ProductSansBold.ttf'),
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
        <View style={styles.container}>
            <View style={{padding: 16, marginTop: 10}}>
                <Text style={styles.statsTitle}>
                    In {currentState}, you discovered <Text style={styles.statsTitleInner}> {area} </Text>sq. miles.
                    That's 
                    <Text style={styles.statsTitleInner}> {percentState}% </Text> 
                    of the state.
                </Text>
            </View>
            <View style={styles.innerContainer}>
                <Picker
                    style={{color: "#fff", fontFamily: 'ProductSansRegular'}}
                    selectedValue={selectedMonthYear}
                    onValueChange={(itemValue) => setSelectedMonthYear(itemValue)}
                >
                    <Picker.Item label='Choose month' value={findLatestMonthYear()} />
                    {availableMonthsYears.map(({ month, year }) => (
                        <Picker.Item
                            key={`${month}-${year}`}
                            label={`${new Date(0, month + 1).toLocaleString('default', { month: 'long' })} ${year}`}
                            value={`${month}-${year}`}
                        />
                    ))}
                </Picker>
            </View>
            <View style={styles.innerContainer}>
                <Text style={styles.statsTitle}>You wandered around for 
                    <Text style={styles.statsTitleInner}>
                        {' '}{totalDistance}{' miles '}
                    </Text>
                    this month.
                </Text>
            </View>
            <View style={styles.barContainer}>
                <Text style={{color: 'grey', fontFamily: 'ProductSansRegular', fontSize: 16}}>Daily Average: 
                    <Text style={{color: 'white'}}>{' '}{calculateDailyAverage(barData)}mi</Text>
                </Text>
                <BarChart
                    barWidth={4}
                    barBorderRadius={10}
                    frontColor="#768fcc"
                    data={barData}
                    yAxisThickness={0}
                    xAxisThickness={0}
                    xAxisLabelTextStyle={{ color: '#fff' }}
                    yAxisTextStyle={{ color: '#fff' }}
                    yAxisColor={'grey'}
                    isAnimated
                    spacing={7}
                    labelWidth={30}
                    roundedTop
                    roundedBottom
                    yAxisSide={yAxisSides.RIGHT}
                    maxValue={barData && Math.max(...barData.map(dataPoint => dataPoint.value))}
                    hideRules
                    initialSpacing={0}
                    formatYLabel={(label: string): string => { 
                        return label === ''+Math.floor(Math.max(...barData.map(dataPoint => dataPoint.value))) || label === ''+Math.round(calculateDailyAverage(barData)) ? label : '';
                    }}
                    height={200}
                    showGradient
                    gradientColor={'rgba(220,220,220,0.7)'}
                    showReferenceLine1
                    referenceLine1Position={Math.max(...barData.map(dataPoint => dataPoint.value))}
                    referenceLine1Config={{
                        color: '#404040',
                        dashWidth: 1,
                        dashGap: 0.000001,
                        
                    }}
                    showReferenceLine2
                    referenceLine2Position={calculateDailyAverage(barData)}
                    referenceLine2Config={{
                        color: 'white',
                        dashWidth: 10,
                        dashGap: 0.000001,
                    }}
                    yAxisLabelContainerStyle={{marginLeft: -15}}
                    />
            </View>
        </View>
    );
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
    },
    innerContainer: {
        padding: 16,
    },
    statsTitle: {
        fontFamily: 'ProductSansBold', 
        color: '#fff',
        fontSize: 30,
    },
    statsTitleInner: {
        fontFamily: 'ProductSansBold', 
        color: '#768fcc',
        fontSize: 30
    },
    barContainer: {
        marginTop: 40,
        paddingLeft: 20,
        paddingRight: 20
    }
});
function setErrorMsg(errorMsg: any) {
    throw new Error('Function not implemented.');
}

