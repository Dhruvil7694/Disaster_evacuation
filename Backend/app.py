from flask import Flask, request, jsonify
import pandas as pd
import geopandas as gpd
import osmnx as ox
import networkx as nx
from shapely.geometry import Point
from flask_cors import CORS
import folium

# Initialize the Flask app
app = Flask(__name__)
CORS(app)  # Enable CORS for all routes

# Dictionary to store road networks
road_networks = {}

# Load and preprocess data
def load_and_preprocess_data():
    df = pd.read_csv('data/worldcities.csv')
    df['city'] = df['city'].str.lower()
    df['country'] = df['country'].str.lower()
    df = df[['city', 'lat', 'lng', 'country', 'iso2', 'iso3', 'admin_name', 'population']]
    df.dropna(subset=['lat', 'lng', 'population', 'admin_name', 'iso2'], inplace=True)
    df = df[df['population'] > 50000]
    df.reset_index(drop=True, inplace=True)
    df['density'] = df['population'] / 20
    df = df.sort_values(by='density', ascending=False)
    geometry = [Point(xy) for xy in zip(df['lng'], df['lat'])]
    gdf = gpd.GeoDataFrame(df, geometry=geometry)
    gdf.set_crs(epsg=4326, inplace=True)
    gdf.to_file('data/processed_indiacities.gpkg', driver='GPKG')
    return gdf

# Load and preprocess data at app start
gdf = load_and_preprocess_data()

@app.route('/api/cities', methods=['GET'])
def get_cities():
    cities = gdf[['city', 'lat', 'lng']].to_dict(orient='records')
    return jsonify(cities)

def get_road_network(city_name):
    """Load the road network for a city if not already loaded."""
    if city_name not in road_networks:
        try:
            # Fetch road network for driving within the specified city
            road_networks[city_name] = ox.graph_from_place(city_name, network_type="drive")
            print(f"Loaded road network for {city_name}")
        except Exception as e:
            print(f"Error loading road network for {city_name}: {e}")
            return None
    return road_networks[city_name]


def find_route(city_name, start_coords, end_coords):
    """
    Calculate the shortest route between two points in the specified city.
    """
    # Check if road network for the city is available
    G = get_road_network(city_name)
    if G is None:
        print(f"No road network available for {city_name}")
        return None

    try:
        # Find the nearest nodes to the start and end coordinates
        orig_node = ox.distance.nearest_nodes(G, start_coords[1], start_coords[0])
        dest_node = ox.distance.nearest_nodes(G, end_coords[1], end_coords[0])

        # Calculate the shortest path using Dijkstra's algorithm
        route_nodes = nx.shortest_path(G, orig_node, dest_node, weight='length')

        # Convert nodes to (latitude, longitude) coordinates
        route_coords = [(G.nodes[node]['y'], G.nodes[node]['x']) for node in route_nodes]
        return route_coords
    
    except nx.NetworkXNoPath:
        print("No path exists between the start and end points.")
        return None

@app.route('/api/find_route', methods=['POST'])
def get_route():
    """API endpoint to get the shortest route between two points."""
    try:
        data = request.get_json()
        city_name = data['city'].lower().strip()
        start_coords = tuple(data['start_coords'])
        end_coords = tuple(data['end_coords'])

        # Check if the city exists in gdf
        city_row = gdf[gdf['city'].str.lower().str.strip() == city_name]
        print(f"Received city: {city_name}, start_coords: {start_coords}, end_coords: {end_coords}")

        if city_row.empty:
            print(f"City '{city_name}' not found")
            return jsonify({'error': 'City not found'}), 404

        # Ensure road network is loaded
        G = get_road_network(city_name)
        if not G:
            return jsonify({'error': 'Failed to load road network'}), 500

        # Find the route
        route_coords = find_route(city_name, start_coords, end_coords)
        if route_coords is None:
            return jsonify({'error': 'No route found between start and end points'}), 404

        return jsonify({'route': route_coords})
    except Exception as e:
        print(f"Route finding error: {e}")
        return jsonify({'error': str(e)}), 500

@app.route('/api/map', methods=['GET'])
def generate_map():
    """Generate an interactive map with city markers and save as HTML."""
    m = folium.Map(location=[0, 0], zoom_start=2)
    for _, row in gdf.iterrows():
        folium.CircleMarker(
            location=(row['lat'], row['lng']),
            radius=5,
            color='blue',
            fill=True,
            fill_color='blue',
            fill_opacity=0.6,
            popup=f"{row['city']}, {row['country']}: {int(row['population'])} people"
        ).add_to(m)
    map_path = 'data/city_map.html'
    m.save(map_path)
    return jsonify({'map_path': map_path})

if __name__ == '__main__':
    app.run(debug=True)
