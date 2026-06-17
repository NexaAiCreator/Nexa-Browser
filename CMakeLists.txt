cmake_minimum_required(VERSION 3.15) # Increased version for runtime support
project(NexaBrowser)

set(CMAKE_CXX_STANDARD 20)
set(CMAKE_CXX_STANDARD_REQUIRED ON)

# This is the magic line that fixes LNK2038
set(CMAKE_MSVC_RUNTIME_LIBRARY "MultiThreaded$<$<CONFIG:Debug>:Debug>")

add_definitions(-DNOMINMAX)
add_definitions(-DUNICODE)
add_definitions(-D_UNICODE)

set(CEF_ROOT "${CMAKE_SOURCE_DIR}/third_party/cef")

include_directories("${CEF_ROOT}")
include_directories("${CEF_ROOT}/include")
link_directories("${CEF_ROOT}/Release")

add_executable(NexaBrowser WIN32
    src/cpp/main.cpp
    src/cpp/browser_window.cpp
)

target_link_libraries(NexaBrowser 
    PRIVATE 
    "${CEF_ROOT}/Release/libcef.lib"
    "User32.lib" 
    "Shell32.lib" 
    "Gdi32.lib" 
    "Ole32.lib" 
    "OleAut32.lib"
)
