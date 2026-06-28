// MUSS die allererste Zeile sein (react-native-gesture-handler-Vorgabe): registriert die
// nativen Gesten-Handler, bevor irgendeine UI lädt. Fehlt der Import, funktionieren Gesten nicht.
import 'react-native-gesture-handler';
import { AppRegistry } from 'react-native';
import { name as appName } from './app.json';
import App from './src/App';

AppRegistry.registerComponent(appName, () => App);
