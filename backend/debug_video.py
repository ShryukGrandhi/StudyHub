
import asyncio
import os
import httpx
from dotenv import load_dotenv

load_dotenv()

OPENNOTE_API_KEY = os.getenv("OPENNOTE_API_KEY")
BASE_URL = "https://api.opennote.com/v1"

class OpenNoteAPI:
    def __init__(self):
        self.client = httpx.AsyncClient(headers={
            "Authorization": f"Bearer {OPENNOTE_API_KEY}",
            "Content-Type": "application/json"
        }, timeout=60.0)
        self.BASE_URL = BASE_URL

    async def video_create(self, messages: list, title: str = ""):
        payload = {
            "model": "picasso",
            "messages": messages,
            "title": title,
            "include_sources": True,
            "upload_to_s3": True
        }
        
        # print(f"Sending payload to {self.BASE_URL}/video/create")
        try:
            response = await self.client.post(f"{self.BASE_URL}/video/create", json=payload)
            # print(f"Status: {response.status_code}")
            if response.status_code != 200:
                print(f"Error: {response.text}")
                return None
            
            data = response.json()
            # print(f"Response: {data}")
            return data
        except Exception as e:
            print(f"Exception: {e}")
            return None

async def main():
    api = OpenNoteAPI()
    result = await api.video_create(
        messages=[{"role": "user", "content": "Explain gravity simply"}],
        title="Debug Video Gravity"
    )
    
    if result and "video_id" in result:
        vid = result["video_id"]
        print(f"VIDEO_ID:{vid}")
        with open("vid.txt", "w") as f:
            f.write(vid)
    else:
        print("FAILED")

if __name__ == "__main__":
    asyncio.run(main())
