# Disable Windows Keys
# https://bblanchon.github.io/disable-windows-keys
# Copyright (C) 2020  Benoit Blanchon

add_compile_definitions(UNICODE _UNICODE)
set(CMAKE_MSVC_RUNTIME_LIBRARY "MultiThreaded$<$<CONFIG:Debug>:Debug>")

if (MSVC)
    add_compile_options(/W4)
endif()

add_executable(disable-shortcuts WIN32
	app.c
	mainwindow.c
	mainwindow.h
	resource.h
	resource.rc
	shared.h
	stdafx.h
)

add_library(disable-shortcuts-hook SHARED
	hook.c
	hook.def
	shared.h
	stdafx.h
)

add_dependencies(disable-shortcuts disable-shortcuts-hook)
