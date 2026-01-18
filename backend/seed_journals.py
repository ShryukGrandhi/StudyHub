import asyncio
import os
import glob
from main import OpenNoteAPI

async def seed_data():
    api = OpenNoteAPI()
    data_dir = os.path.join(os.path.dirname(__file__), "seed_data")
    files = glob.glob(os.path.join(data_dir, "*.md"))
    
    print(f"Found {len(files)} files to seed from {data_dir}...")
    
    for filepath in files:
        filename = os.path.basename(filepath)
        title = filename.replace(".md", "").replace("_", " ").title()
        
        with open(filepath, "r", encoding="utf-8") as f:
            content = f.read()
            
        print(f"Seeding '{title}'...")
        try:
            # Create journal
            result = await api.journals_create(title=title, content=content, tags=["seed_data", "knowledge_base"])
            if result.get("success", True) and result.get("id"):
                print(f"✅ Successfully created: {title} (ID: {result.get('id')})")
            else:
                print(f"⚠️ Created but check result: {result}")
        except Exception as e:
            print(f"❌ Failed to create '{title}': {e}")

if __name__ == "__main__":
    asyncio.run(seed_data())
