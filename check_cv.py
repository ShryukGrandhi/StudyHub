import cv2
import os

print(f"OpenCV Version: {cv2.__version__}")
print(f"Haarcascades Path: {cv2.data.haarcascades}")

face_xml = os.path.join(cv2.data.haarcascades, 'haarcascade_frontalface_default.xml')
eye_xml = os.path.join(cv2.data.haarcascades, 'haarcascade_eye.xml')

print(f"Checking {face_xml}: {'FOUND' if os.path.exists(face_xml) else 'MISSING'}")
print(f"Checking {eye_xml}: {'FOUND' if os.path.exists(eye_xml) else 'MISSING'}")

try:
    face_cascade = cv2.CascadeClassifier(face_xml)
    if face_cascade.empty():
        print("Error: Face cascade loaded but empty!")
    else:
        print("Success: Face cascade loaded.")
except Exception as e:
    print(f"Exception loading face cascade: {e}")
