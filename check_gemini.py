
import os
import sys
import google.generativeai as genai

# Add backend to path to import config
sys.path.append(os.path.join(os.getcwd(), "backend"))
from MASTER_CONFIG import Keys

def check_models():
    print(f"API Key: {Keys.GOOGLE_API_KEY[:10]}...")
    
    try:
        genai.configure(api_key=Keys.GOOGLE_API_KEY)
        
        print("\nListing available models:")
        for m in genai.list_models():
            if 'generateContent' in m.supported_generation_methods:
                print(f"- {m.name}")
                
        print("\nTesting gemini-1.5-flash...")
        try:
            model = genai.GenerativeModel('gemini-1.5-flash')
            response = model.generate_content("Hello")
            print(f"Success! Response: {response.text}")
        except Exception as e:
            print(f"Failed: {e}")
            
        print("\nTesting gemini-2.0-flash...")
        try:
            model = genai.GenerativeModel('gemini-2.0-flash')
            response = model.generate_content("Hello")
            print(f"Success! Response: {response.text}")
        except Exception as e:
            print(f"Failed: {e}")
            
    except Exception as e:
        print(f"Configuration/Listing Error: {e}")

if __name__ == "__main__":
    check_models()
