import { Tabs } from 'expo-router';
import React from 'react';
import { StyleSheet } from 'react-native';

import { TabBarIcon } from '@/components/navigation/TabBarIcon';
import { Colors } from '@/constants/Colors';
import { useColorScheme } from '@/hooks/useColorScheme';

import { Amplify } from "aws-amplify";
import { Authenticator, useAuthenticator, withAuthenticator } from "@aws-amplify/ui-react-native";
import { BlurView } from 'expo-blur';

import { useFonts } from 'expo-font';
import { useEffect } from 'react';
import * as SplashScreen from 'expo-splash-screen';

import awsconfig from '../../src/aws-exports';
Amplify.configure(awsconfig);

function TabLayout() {
  const colorScheme = useColorScheme();
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
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarStyle: { position: 'absolute', backgroundColor: '#212121', borderColor: 'transparent', height: 60 },
        tabBarItemStyle: {marginBottom: 5, marginTop: 5},
        tabBarLabelStyle: {fontFamily: 'ProductSansRegular', fontSize: 12},
        tabBarActiveTintColor: '#768fcc',
        tabBarInactiveTintColor: '#a0a0a0',
        headerStyle: { backgroundColor: 'rgb(30,30,30)'},
        headerTitleStyle: { fontFamily: 'ProductSansRegular', fontSize: 25},
        headerTitleAlign: 'center'
      }}>
      <Tabs.Screen
        name="index"
        options={{
          title: 'Wander',
          tabBarIcon: ({ color, focused }) => (
            <TabBarIcon name={focused ? 'location' : 'location-outline'} color={focused ? '#768fcc' : '#a0a0a0'} size={25} />
          ),
        }}
      />
      <Tabs.Screen
        name="stats"
        options={{
          title: 'You',
          tabBarIcon: ({ color, focused }) => (
            <TabBarIcon name={focused ? 'stats-chart' : 'stats-chart-outline'} color={focused ? '#768fcc' : '#a0a0a0'} size={25} />
          ),
          headerShown: true,
        }}
      />
      <Tabs.Screen
        name="explore"
        options={{
          title: 'Explore',
          tabBarIcon: ({ color, focused }) => (
            <TabBarIcon name={focused ? 'code-slash' : 'code-slash-outline'} color={focused ? '#5c7dd1' : '#a0a0a0'} size={25} />
          ),
        }}
      />
    </Tabs>
  );
}

export default TabLayout;