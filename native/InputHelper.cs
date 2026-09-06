using System;
using System.Collections.Generic;
using System.Diagnostics;
using System.IO;
using System.Runtime.InteropServices;
using System.Text;
using System.Threading;

namespace QuickPasteInputHelper
{
    internal static class Program
    {
        private const uint INPUT_KEYBOARD = 1;
        private const uint KEYEVENTF_KEYUP = 0x0002;
        private const uint KEYEVENTF_UNICODE = 0x0004;
        private const ushort VK_RETURN = 0x0D;
        private const ushort VK_TAB = 0x09;
        private const int SW_RESTORE = 9;
        private const uint PROCESS_QUERY_LIMITED_INFORMATION = 0x1000;
        private const uint TOKEN_QUERY = 0x0008;
        private const int TokenElevation = 20;

        [StructLayout(LayoutKind.Sequential)]
        private struct RECT { public int Left, Top, Right, Bottom; }

        [StructLayout(LayoutKind.Sequential)]
        private struct TOKEN_ELEVATION { public int TokenIsElevated; }

        [StructLayout(LayoutKind.Sequential)]
        private struct KEYBDINPUT
        {
            public ushort wVk;
            public ushort wScan;
            public uint dwFlags;
            public uint time;
            public UIntPtr dwExtraInfo;
        }

        [StructLayout(LayoutKind.Explicit, Size = 32)]
        private struct InputUnion
        {
            [FieldOffset(0)] public KEYBDINPUT ki;
        }

        [StructLayout(LayoutKind.Sequential)]
        private struct INPUT
        {
            public uint type;
            public InputUnion union;
        }

        [DllImport("user32.dll")] private static extern IntPtr GetForegroundWindow();
        [DllImport("user32.dll")] private static extern bool GetWindowRect(IntPtr hWnd, out RECT rect);
        [DllImport("user32.dll")] private static extern bool IsWindow(IntPtr hWnd);
        [DllImport("user32.dll")] private static extern bool IsIconic(IntPtr hWnd);
        [DllImport("user32.dll")] private static extern bool ShowWindowAsync(IntPtr hWnd, int nCmdShow);
        [DllImport("user32.dll")] private static extern bool SetForegroundWindow(IntPtr hWnd);
        [DllImport("user32.dll")] private static extern uint GetWindowThreadProcessId(IntPtr hWnd, out uint processId);
        [DllImport("user32.dll", SetLastError = true)] private static extern uint SendInput(uint count, INPUT[] inputs, int size);
        [DllImport("kernel32.dll", SetLastError = true)] private static extern IntPtr OpenProcess(uint access, bool inherit, uint processId);
        [DllImport("kernel32.dll")] private static extern bool CloseHandle(IntPtr handle);
        [DllImport("advapi32.dll", SetLastError = true)] private static extern bool OpenProcessToken(IntPtr process, uint access, out IntPtr token);
        [DllImport("advapi32.dll", SetLastError = true)] private static extern bool GetTokenInformation(IntPtr token, int infoClass, out TOKEN_ELEVATION info, int infoLength, out int returnedLength);

        public static int Main(string[] args)
        {
            Console.OutputEncoding = Encoding.UTF8;
            try
            {
                if (args.Length == 1 && args[0] == "capture") return Capture();
                if (args.Length == 2 && args[0] == "type") return TypeText(args[1]);
                return Fail("invalid_arguments");
            }
            catch (Exception ex)
            {
                return Fail("helper_failed", ex.Message);
            }
        }

        private static int Capture()
        {
            IntPtr window = GetForegroundWindow();
            RECT rect;
            if (window == IntPtr.Zero || !GetWindowRect(window, out rect)) return Fail("target_missing");
            Console.WriteLine("{\"ok\":true,\"handle\":\"" + window.ToInt64() + "\",\"left\":" + rect.Left + ",\"top\":" + rect.Top + ",\"right\":" + rect.Right + ",\"bottom\":" + rect.Bottom + "}");
            return 0;
        }

        private static int TypeText(string handleValue)
        {
            long rawHandle;
            if (!long.TryParse(handleValue, out rawHandle)) return Fail("target_missing");
            IntPtr window = new IntPtr(rawHandle);
            if (!IsWindow(window)) return Fail("target_missing");
            if (IsTargetElevated(window) && !IsCurrentProcessElevated()) return Fail("elevated_target");

            string text = ReadStandardInputUtf8();
            if (IsIconic(window)) ShowWindowAsync(window, SW_RESTORE);
            SetForegroundWindow(window);

            bool focused = false;
            for (int i = 0; i < 25; i++)
            {
                if (GetForegroundWindow() == window) { focused = true; break; }
                Thread.Sleep(20);
                SetForegroundWindow(window);
            }
            if (!focused) return Fail("focus_failed");

            List<INPUT> batch = new List<INPUT>(400);
            for (int i = 0; i < text.Length; i++)
            {
                char character = text[i];
                if (character == '\r')
                {
                    if (i + 1 < text.Length && text[i + 1] == '\n') i++;
                    AddVirtualKey(batch, VK_RETURN);
                }
                else if (character == '\n') AddVirtualKey(batch, VK_RETURN);
                else if (character == '\t') AddVirtualKey(batch, VK_TAB);
                else AddUnicode(batch, character);

                if (batch.Count >= 400 && !Flush(batch)) return Fail("input_failed");
            }
            if (!Flush(batch)) return Fail("input_failed");
            Console.WriteLine("{\"ok\":true}");
            return 0;
        }

        private static string ReadStandardInputUtf8()
        {
            using (Stream input = Console.OpenStandardInput())
            using (StreamReader reader = new StreamReader(input, new UTF8Encoding(false, true), true))
            {
                return reader.ReadToEnd();
            }
        }

        private static void AddUnicode(List<INPUT> batch, char character)
        {
            batch.Add(CreateKeyboardInput(0, character, KEYEVENTF_UNICODE));
            batch.Add(CreateKeyboardInput(0, character, KEYEVENTF_UNICODE | KEYEVENTF_KEYUP));
        }

        private static void AddVirtualKey(List<INPUT> batch, ushort key)
        {
            batch.Add(CreateKeyboardInput(key, (char)0, 0));
            batch.Add(CreateKeyboardInput(key, (char)0, KEYEVENTF_KEYUP));
        }

        private static INPUT CreateKeyboardInput(ushort key, char scan, uint flags)
        {
            INPUT input = new INPUT();
            input.type = INPUT_KEYBOARD;
            input.union.ki.wVk = key;
            input.union.ki.wScan = scan;
            input.union.ki.dwFlags = flags;
            input.union.ki.time = 0;
            input.union.ki.dwExtraInfo = UIntPtr.Zero;
            return input;
        }

        private static bool Flush(List<INPUT> batch)
        {
            if (batch.Count == 0) return true;
            INPUT[] values = batch.ToArray();
            uint sent = SendInput((uint)values.Length, values, Marshal.SizeOf(typeof(INPUT)));
            batch.Clear();
            return sent == values.Length;
        }

        private static bool IsTargetElevated(IntPtr window)
        {
            uint processId;
            GetWindowThreadProcessId(window, out processId);
            IntPtr process = OpenProcess(PROCESS_QUERY_LIMITED_INFORMATION, false, processId);
            if (process == IntPtr.Zero) return false;
            try { return IsElevated(process); }
            finally { CloseHandle(process); }
        }

        private static bool IsCurrentProcessElevated()
        {
            return IsElevated(Process.GetCurrentProcess().Handle);
        }

        private static bool IsElevated(IntPtr process)
        {
            IntPtr token;
            if (!OpenProcessToken(process, TOKEN_QUERY, out token)) return false;
            try
            {
                TOKEN_ELEVATION elevation;
                int returned;
                if (!GetTokenInformation(token, TokenElevation, out elevation, Marshal.SizeOf(typeof(TOKEN_ELEVATION)), out returned)) return false;
                return elevation.TokenIsElevated != 0;
            }
            finally { CloseHandle(token); }
        }

        private static int Fail(string code, string message = null)
        {
            string safe = (message ?? "").Replace("\\", "\\\\").Replace("\"", "\\\"").Replace("\r", " ").Replace("\n", " ");
            Console.WriteLine("{\"ok\":false,\"code\":\"" + code + "\",\"message\":\"" + safe + "\"}");
            return 1;
        }
    }
}
