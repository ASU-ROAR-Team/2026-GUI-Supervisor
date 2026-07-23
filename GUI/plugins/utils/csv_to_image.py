import pandas as pd
from PIL import Image
import numpy as np

def cost_to_grayscale_color(cost_value, min_cost, max_cost):
    """
    Maps a cost value to an RGB grayscale color.
    -1 values are assigned a specific light gray color.
    Valid costs are mapped to a grayscale gradient.

    Args:
        cost_value (float): The cost value from the CSV.
        min_cost (float): The minimum valid cost value in the dataset (excluding -1).
        max_cost (float): The maximum valid cost value in the dataset (excluding -1).

    Returns:
        tuple: An (R, G, B) tuple representing the grayscale color.
    """
    # Handle -1 specifically (e.g., light gray for unknown/out-of-bounds)
    if cost_value == -1:
        return (200, 200, 200) # Light gray

    # Handle case where all valid costs are the same
    if max_cost == min_cost:
        return (128, 128, 128) # Mid-gray for uniform valid costs

    # Normalize the valid cost value to the range [0, 1]
    # Use a small epsilon to prevent division by zero if max_cost == min_cost,
    # although the previous check should handle this.
    range_cost = max_cost - min_cost
    if range_cost == 0:
        normalized_cost = 0 # Or 0.5 if you want mid-gray
    else:
        normalized_cost = (cost_value - min_cost) / range_cost

    # Map normalized cost to a grayscale value (0-255)
    # 0 normalized cost -> 0 grayscale (black)
    # 1 normalized cost -> 255 grayscale (white)
    grayscale_value = int(normalized_cost * 255)

    # Clamp value to ensure it's within 0-255 range
    grayscale_value = max(0, min(255, grayscale_value))

    # Return as an RGB tuple where R=G=B for grayscale
    return (grayscale_value, grayscale_value, grayscale_value)


def csv_to_image_with_unknown(csv_filepath, output_image_filepath):
    """
    Converts a CSV file representing a grid of numerical values into a color image
    using a grayscale map for valid costs and a specific color for -1 values.

    Args:
        csv_filepath (str): Path to the input CSV file.
        output_image_filepath (str): Path to save the output image file (e.g., 'costmap.png').
    """
    try:
        # Read the CSV data into a pandas DataFrame
        # Assuming no header row and comma delimiter
        df = pd.read_csv(csv_filepath, header=None)

        # Convert the DataFrame to a NumPy array
        data = df.values

        # Find the minimum and maximum values in the data, EXCLUDING -1
        # Use a masked array or filter to find min/max only among non -1 values
        valid_data = data[data != -1]

        min_val = np.min(valid_data) if valid_data.size > 0 else 0
        max_val = np.max(valid_data) if valid_data.size > 0 else 0

        print(f"Found Min Valid Cost (excluding -1): {min_val}, Max Valid Cost (excluding -1): {max_val}")

        # Create a new NumPy array for the RGB image data
        # The shape will be (height, width, 3) for RGB channels
        height, width = data.shape
        rgb_data = np.zeros((height, width, 3), dtype=np.uint8)

        # Iterate through the data and apply the grayscale mapping with -1 handling
        for y in range(height):
            for x in range(width):
                cost = data[y, x]
                # Use the cost_to_grayscale_color function
                color = cost_to_grayscale_color(cost, min_val, max_val)
                rgb_data[y, x, 0] = color[0] # Red channel
                rgb_data[y, x, 1] = color[1] # Green channel
                rgb_data[y, x, 2] = color[2] # Blue channel

        # Create a color image from the RGB data (even though it's grayscale + one color)
        image = Image.fromarray(rgb_data, 'RGB') # 'RGB' mode

        # --- Save the image file ---
        image.save(output_image_filepath)

        print(f"Successfully converted '{csv_filepath}' to '{output_image_filepath}' ({width}x{height} pixels) with grayscale and unknown handling.")

    except FileNotFoundError:
        print(f"Error: CSV file not found at '{csv_filepath}'")
    except Exception as e:
        print(f"An error occurred during conversion: {e}")

if __name__ == "__main__":
    # --- Configuration ---
    # Replace with the actual path to your CSV file on the competition PC
    input_csv = '~/Downloads/total_cost.csv' # Example path
    # Replace with the desired output image file name and path relative to your web server root
    output_png = '/media/omar/D424FE9724FE7C34/APF_ws/src/ROAR-Teleop-Interface/costmap.png' # Example path

    # --- Run the conversion ---
    csv_to_image_with_unknown(input_csv, output_png)
