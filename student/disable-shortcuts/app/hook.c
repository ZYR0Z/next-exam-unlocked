// Disable Windows Keys
// https://bblanchon.github.io/disable-windows-keys
// Copyright (C) 2020  Benoit Blanchon

#include "shared.h"
#include "stdafx.h"

LRESULT CALLBACK HookProc(int nCode, WPARAM wParam, LPARAM lParam) {
  if (nCode == HC_ACTION) {
    assert(wParam == WM_KEYDOWN || wParam == WM_KEYUP ||
           wParam == WM_SYSKEYDOWN || wParam == WM_SYSKEYUP);

    DWORD vkCode = ((KBDLLHOOKSTRUCT *)lParam)->vkCode;

    // If it's the Windows key or alt tab or something else
    if (vkCode == VK_LWIN || vkCode == VK_RWIN ||
        (vkCode == VK_TAB && LLKHF_ALTDOWN) ||
        (vkCode == VK_ESCAPE && LLKHF_ALTDOWN ) ||
        (vkCode == VK_CONTROL && LLKHF_ALTDOWN && VK_DELETE) ||
        (vkCode == VK_CONTROL && VK_MENU && VK_DELETE)
        ) {

      // Notify app
      if (wParam == WM_KEYDOWN || wParam == WM_SYSKEYDOWN) {
        HWND hwnd = FindWindow(MAIN_WINDOW_CLASS, 0);
        if (hwnd)
          PostMessage(hwnd, WM_KEYPRESS_INTERCEPTED, 0, 0);
      }

      // Stop propagation
      return 1;
    }
  }

  // Propagate the event
  return CallNextHookEx(NULL, nCode, wParam, lParam);
}